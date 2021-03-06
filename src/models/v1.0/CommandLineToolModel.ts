import {CommandLineTool, ProcessRequirement, CWLVersion, Expression} from "../../mappings/v1.0/";
import {CommandInputParameterModel} from "./CommandInputParameterModel";
import {CommandOutputParameterModel} from "./CommandOutputParameterModel";
import {CommandLinePart} from "../helpers";
import {JobHelper} from "../helpers/JobHelper";
import {CommandArgumentModel} from "./CommandArgumentModel";
import {CommandLineRunnable} from "../interfaces";

export class CommandLineToolModel implements CommandLineTool, CommandLineRunnable {
    constructor(json: any) {
        if (!Array.isArray(json.inputs)) {
            json.inputs = Object.keys(json.inputs).map(id =>(<any> Object).assign(json.inputs[id], {id}));
        }

        if (!Array.isArray(json.outputs)) {
            json.inputs = Object.keys(json.outputs).map(id =>(<any> Object).assign(json.outputs[id], {id}));
        }

        this.inputs      = json.inputs.map(input => new CommandInputParameterModel(input));
        this.outputs     = json.outputs.map(output => new CommandOutputParameterModel(output));
        this.baseCommand = Array.isArray(json.baseCommand) ? json.baseCommand : [json.baseCommand];

        this.id          = json.id;
        this.description = json.description;
        this.label       = json.label;

        this.requirements = json.requirements;
        this.hints        = json.hints;
        this.arguments    = json.arguments.map(arg => new CommandArgumentModel(arg));

        this.stdin  = json.stdin;
        this.stderr = json.stderr;
        this.stdout = json.stdout;

        this.successCodes       = json.successCodes;
        this.temporaryFailCodes = json.temporaryFailCodes;
        this.permanentFailCodes = json.permanentFailCodes;

        this.cwlVersion = json.cwlVersion;
    }

    inputs: Array<CommandInputParameterModel>;
    outputs: Array<CommandOutputParameterModel>;

    id: string;
    requirements: Array<ProcessRequirement>;

    hints: Array<any>;
    label: string;
    description: string;
    cwlVersion: CWLVersion;

    'class': string = 'CommandLineTool';
    baseCommand: string|Array<string>;

    arguments: Array<CommandArgumentModel>;
    stdin: string|Expression;
    stdout: string|Expression;
    stderr: string|Expression;

    successCodes: Array<number>;
    temporaryFailCodes: Array<number>;
    permanentFailCodes: Array<number>;

    generateCommandLine(): string {
        let parts = this.generateCommandLineParts();

        return (<string []> this.baseCommand).concat(parts.map(part => part.value)).join(' ');
    }

    private generateCommandLineParts(job?: any): CommandLinePart[] {

        if (!job) {
            job = JobHelper.getJob(this);
        }

        let allParts: CommandLinePart[] = [];

        allParts.concat(this.inputs.map(input => input.getCommandPart(job, job[input.id])));
        allParts.concat(this.arguments.map(arg => arg.getCommandPart(job)));

        allParts.sort(this.sortingKeySort);

        //@todo(maya) add stdin and stdout
        return allParts;
    }

    //@todo(maya): implement MSD radix sort for sorting key
    private sortingKeySort(a: CommandLinePart, b: CommandLinePart) {
        let posA = a.sortingKey[0];
        let posB = b.sortingKey[0];
        if (posA > posB) {
            return 1;
        }
        if (posA < posB) {
            return -1;
        }

        let indA = a.sortingKey[1];
        let indB = b.sortingKey[1];

        if (indA > indB) {
            return 1;
        }
        if (indA < indB) {
            return -1;
        }

        // defaults to returning 1 in case both position and index match (should never happen)
        return 0;
    }

    public toString(): string {
        return JSON.stringify(this, null, 2);
    }
}