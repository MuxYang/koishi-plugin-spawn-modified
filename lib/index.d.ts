import { Context } from 'koishi';
import { Config } from './config';
export { Config } from './config';
declare module 'koishi' {
    interface Context {
        puppeteer?: {
            page(): Promise<any>;
        };
    }
}
export interface State {
    command: string;
    timeout: number;
    output: string;
    code?: number;
    signal?: NodeJS.Signals;
    timeUsed?: number;
}
export declare const name = "spawn";
export declare const inject: {
    optional: string[];
};
export declare function apply(ctx: Context, config: Config): void;
