import type { ValueSchemaSpec } from '@deepseek-ai/dsh-tools';
export declare const taskRecordSchema: ValueSchemaSpec;
export declare const runSummarySchema: ValueSchemaSpec;
export declare const waitSchema: ValueSchemaSpec;
export declare const healthSchema: ValueSchemaSpec;
export declare const assignmentSchema: ValueSchemaSpec;
export declare const recoveryInstructionSchema: ValueSchemaSpec;
export declare const checkpointRequestSchema: ValueSchemaSpec;
export declare const resurrectionRequestSchema: ValueSchemaSpec;
export declare const battleResRequestSchema: ValueSchemaSpec;
export declare const partyMessageSchema: ValueSchemaSpec;
export declare const validationManifestSchema: ValueSchemaSpec;
export declare const validationReportSchema: ValueSchemaSpec;
export declare const commanderTicketSchema: ValueSchemaSpec;
export declare const battleResActionSchema: ValueSchemaSpec;
export declare const verificationSchema: ValueSchemaSpec;
export declare const runSummaryOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const waitOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const healthOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const assignmentOutput: {
    schema: import("@deepseek-ai/dsh-tools").OneOfValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const taskRecordOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const recoveryInstructionOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const checkpointRequestOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const battleResRequestOutput: {
    schema: import("@deepseek-ai/dsh-tools").OneOfValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const taskLeaseOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const verificationOutput: {
    schema: import("@deepseek-ai/dsh-tools").OneOfValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const partyMessageOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const validationManifestOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const validationReportOutput: {
    schema: import("@deepseek-ai/dsh-tools").ObjectValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export declare const battleResActionOutput: {
    schema: import("@deepseek-ai/dsh-tools").OneOfValueSchemaSpec;
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
