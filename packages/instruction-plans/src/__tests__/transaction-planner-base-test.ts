import '@solana/test-matchers/toBeFrozenObject';

import { Address } from '@solana/addresses';
import { pipe } from '@solana/functional';
import { Instruction } from '@solana/instructions';
import {
    appendTransactionMessageInstructions,
    CompilableTransactionMessage,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/transaction-messages';

import { sequentialInstructionPlan, singleInstructionPlan } from '../instruction-plan';
import { singleTransactionPlan, TransactionPlan } from '../transaction-plan';
import { createBaseTransactionPlanner } from '../transaction-planner-base';
import { instructionFactory, transactionPercentFactory } from './__setup__';

function createMockTransactionMessage(): CompilableTransactionMessage {
    return pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer('E9Nykp3rSdza2moQutaJ3K3RSC8E5iFERX2SqLTsQfjJ' as Address, m),
        // TODO(loris): Either remove lifetime constraint or use the new
        // `fillMissingTransactionMessageLifetimeUsingProvisoryBlockhash`
        // function from https://github.com/anza-xyz/kit/pull/519.
        m =>
            setTransactionMessageLifetimeUsingBlockhash(
                {
                    blockhash: '11111111111111111111111111111111',
                    lastValidBlockHeight: 0n,
                } as Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0],
                m,
            ),
    );
}

function getHelpers(createTransactionMessage: () => CompilableTransactionMessage) {
    return {
        instruction: instructionFactory(),
        singleTransactionPlan: (instructions: Instruction[]) =>
            singleTransactionPlan(
                appendTransactionMessageInstructions(
                    instructions,
                    createTransactionMessage(),
                ) as CompilableTransactionMessage,
            ),
        txPercent: transactionPercentFactory(createTransactionMessage),
    };
}

describe('createBaseTransactionPlanner', () => {
    /**
     *  [A: 42] ───────────────────▶ [Tx: A]
     */
    it('plans a single instruction', async () => {
        expect.assertions(1);
        const createTransactionMessage = createMockTransactionMessage;
        const { instruction, singleTransactionPlan } = getHelpers(createTransactionMessage);
        const planner = createBaseTransactionPlanner({ createTransactionMessage });
        const instructionA = instruction('A', 42);

        await expect(planner(singleInstructionPlan(instructionA))).resolves.toEqual(
            singleTransactionPlan([instructionA]),
        );
    });

    /**
     *  [A: 200%] ───────────────────▶ Error
     */
    it('fail if a single instruction is too large', async () => {
        expect.assertions(1);
        const createTransactionMessage = createMockTransactionMessage;
        const { instruction, singleTransactionPlan, txPercent } = getHelpers(createTransactionMessage);
        const planner = createBaseTransactionPlanner({ createTransactionMessage });
        const instructionA = instruction('A', txPercent(200));

        const expectedError = new Error('Instruction plan results in invalid transaction plan') as Error & {
            plan: TransactionPlan;
        };
        expectedError.plan = singleTransactionPlan([instructionA]);

        await expect(planner(singleInstructionPlan(instructionA))).rejects.toThrow(expectedError);
    });

    /**
     *  [Seq] ───────────────────▶ [Tx: A + B]
     *   │
     *   ├── [A: 50%]
     *   └── [B: 50%]
     */
    it('plans a sequential plan with instructions that all fit in a single transaction', async () => {
        expect.assertions(1);
        const createTransactionMessage = createMockTransactionMessage;
        const { instruction, singleTransactionPlan, txPercent } = getHelpers(createTransactionMessage);
        const planner = createBaseTransactionPlanner({ createTransactionMessage });
        const instructionA = instruction('A', txPercent(50));
        const instructionB = instruction('B', txPercent(50));

        await expect(
            planner(
                sequentialInstructionPlan([singleInstructionPlan(instructionA), singleInstructionPlan(instructionB)]),
            ),
        ).resolves.toEqual(singleTransactionPlan([instructionA, instructionB]));
    });
});
