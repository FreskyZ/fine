import dayjs from 'dayjs';
import { MyError } from './error.js';

// this rate limit class throw MyError.kind = 'rate-limit'
// this is not same as in remote-akari, that relies on node:http types

export class RateLimit {
    public readonly buckets: Record<string, {
        amount: number, // remining token amount
        updateTime: dayjs.Dayjs, // amount change time, refill based on this
    }> = {};
    public constructor(
        private readonly name: string,
        private readonly fullAmount: number, // max tokens
        private readonly refillRate: number, // refill count per second
    ) {}

    public cleanup() {
        for (const [key, bucket] of Object.entries(this.buckets)) {
            const elapsed = dayjs.utc().diff(bucket.updateTime, 'second');
            bucket.amount = Math.min(this.fullAmount, bucket.amount + elapsed * this.refillRate);
            if (bucket.amount == this.fullAmount && bucket.updateTime.add(1, 'hour').isBefore(dayjs.utc())) {
                delete this.buckets[key];
            } else {
                bucket.updateTime = dayjs.utc();
            }
        }
    }

    public request(key: string) {
        let bucket = this.buckets[key];
        if (!bucket) {
            bucket = { amount: this.fullAmount, updateTime: dayjs.utc() };
            this.buckets[key] = bucket;
        } else {
            const elapsed = dayjs.utc().diff(bucket.updateTime, 'second');
            bucket.amount = Math.min(this.fullAmount, bucket.amount + elapsed * this.refillRate);
            bucket.updateTime = dayjs.utc();
        }
        // interestingly, if you send too many (like Promise.all() with length 500),
        // this will become very negative and need long time to recover, and furthur request still increase the negativity
        bucket.amount -= 1;
        if (bucket.amount < 0) {
            throw new MyError('rate-limit', undefined, this.name);
        }
    }
}
