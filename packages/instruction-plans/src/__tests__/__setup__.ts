import { Address, getAddressDecoder } from '@solana/addresses';
import { fixEncoderSize, getUtf8Encoder } from '@solana/codecs';
import type { Instruction } from '@solana/instructions';
import type { CompilableTransactionMessage } from '@solana/transaction-messages';
import { getTransactionMessageSize, TRANSACTION_SIZE_LIMIT } from '@solana/transactions';

const MINIMUM_INSTRUCTION_SIZE = 35;

export function instructionFactory(baseSeed?: string) {
    const seedPrefix = baseSeed ? `${baseSeed}-` : '';
    const seedEncoder = fixEncoderSize(getUtf8Encoder(), 32);
    const addressDecoder = getAddressDecoder();
    const getProgramAddress = (seed: string): Address => addressDecoder.decode(seedEncoder.encode(seed));

    return (seed: string, bytes: number): Instruction => {
        if (bytes < MINIMUM_INSTRUCTION_SIZE) {
            throw new Error(`Instruction size must be at least ${MINIMUM_INSTRUCTION_SIZE} bytes`);
        }
        return {
            data: new Uint8Array(bytes - MINIMUM_INSTRUCTION_SIZE),
            programAddress: getProgramAddress(`${seedPrefix}${seed}`),
        };
    };
}

export function transactionPercentFactory(createTransactionMessage: () => CompilableTransactionMessage) {
    const minimumTransactionSize = getTransactionMessageSize(createTransactionMessage());
    const remainingSize = TRANSACTION_SIZE_LIMIT - minimumTransactionSize - 1; /* For shortU16. */
    return (percent: number) => Math.floor((remainingSize * percent) / 100);
}
