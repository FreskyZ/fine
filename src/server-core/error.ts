import { SourceMapConsumer } from 'source-map';

// request and process unexpected error handlers

const stackFrameRegex1 = /^(?<file>.+):(?<line>\d+):(?<column>\d+)$/;
const stackFrameRegex2 = /^(?<name>[\w.]+)( \[as (?<asName>.+)\])? \((?<file>.+):(?<line>\d+):(?<column>\d+)\)$/;

export async function handleRequestHandlerError(): Promise<void> {

}
