import {CommandInputParameter} from "../../mappings/d2sb/CommandInputParameter";
import {CommandLineInjectable} from "../interfaces/CommandLineInjectable";
import {CommandLinePart} from "../helpers/CommandLinePart";
import {Datatype} from "../../mappings/d2sb/Datatype";
import {MapType, EnumType, ArrayType, RecordType} from "../../mappings/d2sb/CommandInputSchema";
import {CommandLineBinding} from "../../mappings/d2sb/CommandLineBinding";
import {TypeResolver, TypeResolution} from "../helpers/TypeResolver";
import {CommandInputRecordField} from "../../mappings/d2sb/CommandInputRecordField";
import {Expression} from "../../mappings/d2sb/Expression";
import {Serializable} from "../interfaces/Serializable";
import {CommandLineBindingModel} from "./CommandLineBindingModel";
import {ExpressionModel} from "./ExpressionModel";
import {ValidationBase, Validation} from "../helpers/validation";

export class CommandInputParameterModel extends ValidationBase implements Serializable<CommandInputParameter | CommandInputRecordField>, CommandLineInjectable {
    /** unique identifier of input */
    public id: string;
    /** Human readable short name */
    public label: string;
    /** Human readable, Markdown format description */
    public description: string;

    /** Flag if input is required. Derived from type field */
    public isRequired: boolean = true;
    /** Flag if input is field of a parent record. Derived from type field */
    public isField: boolean    = false;

    /**
     * Primitive type of input
     * Complex types such as {type: "array", items: "string"}
     * are flattened to this.type == "array"
     * and this.items == "string"
     */
    public type: string = null;
    /** Primitive type of items, if input is an array */
    public items: string = null;
    /** InputBinding defined for items inside of {type: "array"} object */
    private itemsBinding: CommandLineBinding = null;
    /** Fields mapped to InputParameterModel for easier command line generation */
    public fields: Array<CommandInputParameterModel> = null;
    /** Symbols defined in {type: "enum"} */
    public symbols: Array<string>                    = null;

    /** Binding for inclusion in command line */
    private inputBinding: CommandLineBindingModel = null;

    /** name property in type object, only applicable for "enum" and "record" */
    private typeName: string = null;


    public job: any; //@todo better way to set job?

    public self: any; //@todo calculate self based on id??

    serialize(): CommandInputParameter | CommandInputRecordField {
        return undefined;
    }

    deserialize(input: CommandInputParameter | CommandInputRecordField): void {
        this.isField     = !!(<CommandInputRecordField> input).name; // record fields don't have ids
        this.id          = (<CommandInputParameter> input).id
            || (<CommandInputRecordField> input).name || ""; // for record fields
        this.label       = input.label;
        this.description = input.description;

        // if inputBinding isn't defined in input, it shouldn't exist as an object in model
        this.inputBinding = input.inputBinding !== undefined ?
            new CommandLineBindingModel(`${this.loc}.inputBinding`, input.inputBinding) : null;

        if (this.inputBinding) {
            this.inputBinding.setValidationCallback((err: Validation) => this.updateValidity(err));
        }

        const resolved: TypeResolution = TypeResolver.resolveType(input.type);

        this.type   = resolved.type;
        this.fields = resolved.fields ? resolved.fields.map((field, index) => {
            const f = new CommandInputParameterModel(`${this.loc}.fields[${index}]`, field);
            f.setValidationCallback((err: Validation) => {
                this.updateValidity(err);
            });
            return new CommandInputParameterModel(field);
        }) : resolved.fields;

        this.items      = resolved.items;
        this.symbols    = resolved.symbols;
        this.isRequired = resolved.isRequired;

        this.itemsBinding = resolved.itemsBinding;
        this.typeName = resolved.typeName;
    }


    constructor(loc: string, input?: CommandInputParameter | CommandInputRecordField) {
        super(loc);
        if (input) {
            this.deserialize(input);
        }
    }

    getCommandPart(job?: any, value?: any, self?: any): CommandLinePart {

        // only include if they have command line binding
        if (!this.inputBinding || typeof value === "undefined") {
            return null;
        }

        // If type declared does not match type of value, throw error
        if (!TypeResolver.doesTypeMatch(this.type, value)) {
            // If there are items, only throw exception if items don't match either
            if (!this.items || !TypeResolver.doesTypeMatch(this.items, value)) {
                throw(`Mismatched value and type definition expected for ${this.id}. ${this.type} 
                or ${this.items}, but instead got ${typeof value}`);
            }
        }

        let prefix          = this.inputBinding.prefix || "";
        const separator     = (!!prefix && this.inputBinding.separate !== false) ? " " : "";
        const position      = this.inputBinding.position || 0;
        const itemSeparator = this.inputBinding.itemSeparator;

        const itemsPrefix = (this.itemsBinding && this.itemsBinding.prefix)
            ? this.itemsBinding.prefix : '';

        // array
        if (Array.isArray(value)) {
            const parts         = value.map(val => this.getCommandPart(job, val));
            let calcVal: string = '';

            // if array has itemSeparator resolve as
            // --prefix [separate] value1(delimiter)value2(delimiter)value3
            if (itemSeparator) {
                calcVal = prefix + separator + parts.map((val) => {
                        return val.value;
                        // return this.resolve(job, val, this.inputBinding);
                    }).join(itemSeparator);

                // null separator, resolve as
                // --prefix [separate] value1
                // --prefix [separate] value2
                // --prefix [separate] value3

            } else if (itemSeparator === null) {
                calcVal = parts.map((val) => {
                    return prefix + separator + val.value;
                }).join(" ");

                // no separator, resolve as
                // --prefix [separate] (itemPrefix) value1
                // (itemPrefix) value2
                // (itemPrefix) value3
            } else {
                // booleans are a special
                if (this.items === "boolean") {
                    calcVal = prefix + separator + parts
                            .map(part => part.value)
                            .join(" ").trim();
                } else {
                    const itemPrefSep = this.inputBinding.separate !== false ? " " : "";
                    const joiner = !!itemsPrefix ? " " : "";
                    calcVal = prefix + separator + parts
                            .map(part => itemsPrefix + itemPrefSep + part.value)
                            .join(joiner).trim();
                }

            }

            return new CommandLinePart(calcVal, [position, this.id], "input");
        }

        // record
        if (typeof value === "object") {
            // make sure object isn't a file, resolve handles files
            if (!value.path) {
                // evaluate record by calling generate part for each field
                const parts = this.fields.map((field) => field.getCommandPart(job, value[field.id]));

                let calcVal: string = '';

                parts.forEach((part) => {
                    calcVal += " " + part.value;
                });

                return new CommandLinePart(calcVal, [position, this.id], "input");
            }
        }

        // boolean should only include prefix and valueFrom (booleans === flags)
        if (typeof value === "boolean") {
            if (value) {
                prefix        = this.items === "boolean" ? itemsPrefix : prefix;
                const calcVal = prefix + separator + this.resolve({$job: job, $self: ''}, this.inputBinding);
                return new CommandLinePart(calcVal, [position, this.id], "input");
            } else {
                return new CommandLinePart('', [position, this.id], "input");
            }
        }

        // not record or array or boolean
        // if the input has items, this is a recursive call and prefix should not be added again
        prefix        = this.items ? '' : prefix;
        const calcVal = prefix + separator + this.resolve({$job: job, $self: value}, this.inputBinding);
        return new CommandLinePart(calcVal, [position, this.id], "input");
    }

    private resolve(context: {$job: any, $self: any}, inputBinding: CommandLineBindingModel): any {
        if (inputBinding.valueFrom) {
            return inputBinding.valueFrom.evaluate(context);
        }

        let value = context.$self;

        if (value.path) {
            value = value.path;
        }

        return value;
    }

    public setType(type: Datatype | EnumType | MapType | ArrayType | RecordType): void {
        this.type = type;

        switch (type) {
            case "array":
                this.symbols = null;
                this.fields  = null;
                break;
            case "enum":
                this.items  = null;
                this.fields = null;
                break;
            case "record":
                this.items   = null;
                this.symbols = null;
                break;
        }
    }

    public getType(): string {
        return this.type;
    }

    public setItems(type: Datatype | EnumType | MapType | ArrayType | RecordType): void {
        if (this.type !== "array") {

            throw("Items can only be set to inputs type Array");
        } else {
            this.items = type;
        }
    }

    public getItems(): string {
        return this.items;
    }

    public addField(field: CommandInputParameterModel | CommandInputParameter | CommandInputRecordField): void {
        if (this.type !== "record" && this.items !== "record") {
            throw(`Fields can only be added to type or items record: type is ${this.type}, items is ${this.items}.`);
        } else {
            const duplicate = this.fields.filter(val => {
                return val.id === (<CommandInputRecordField> field).name
                    || val.id === (<CommandInputParameter> field).id;
            });
            if (duplicate.length > 0) {
                throw(`Field with name "${duplicate[0].id}" already exists`);
            }

            if (field instanceof CommandInputParameterModel) {
                this.fields.push(field);
            } else {
                this.fields.push(new CommandInputParameterModel(`${this.loc}.fields[${this.fields.length}]`, <CommandInputRecordField>field));
            }
        }
    }

    public removeField(field: CommandInputParameterModel | string) {
        let found;

        if (typeof field === "string") {
            found = this.fields.filter(val => val.id === field)[0];
        } else {
            found = field;
        }

        const index = this.fields.indexOf(found);
        if (index < 0) {
            throw(`Field ${field} does not exist on input`);
        }

        this.fields.splice(index, 1);
    }

    public addSymbol(symbol: string) {
        if (this.type !== "enum" && this.items !== "enum") {
            throw(`Items can only be set to inputs type array`);
        }
    }

    public getLabel(): string {
        return this.label;
    }

    public setLabel(label: string) {
        this.label = label;
    }

    public getDescription(): string {
        return this.description;
    }

    public setDescription(description: string) {
        this.description = description;
    }

    //@todo(maya) implement serialization
    public toString(format: string = 'json') {
        if (format === 'json') {

        } else if (format === 'yaml') {

        }
    }

    public setValueFrom(value: string | Expression): void {
        if (!this.inputBinding) {
            this.inputBinding = new CommandLineBindingModel(`${this.loc}.inputBinding`, {});
            this.inputBinding.setValidationCallback((err: Validation) => this.updateValidity(err));
        }
        this.inputBinding.setValueFrom(value);
    }

    public getValueFrom(): ExpressionModel {
        return this.inputBinding ? this.inputBinding.valueFrom : undefined;
    }

    public hasInputBinding(): boolean {
        return this.inputBinding !== undefined && this.inputBinding !== null;
    }

    public removeInputBinding(): void {
        this.inputBinding = null;
    }

    //@todo(maya) implement validation
    validate(): Validation {
        const val = {errors: [], warnings: []}; // purge current validation;

        const location = this.isField ? "fields[<fieldIndex>]" : "inputs[<inputIndex>]";

        if (this.inputBinding && this.inputBinding.valueFrom) {
            this.inputBinding.valueFrom.evaluate({$job: this.job, $self: this.self});
        }

        // check id validity
        // doesn't exist
        if (this.id === "" || this.id === undefined) {
            val.errors.push({
                message: "ID must be set",
                loc: `${this.loc}.id`
            });
            // contains illegal characters
        } else if (!/^[a-zA-Z0-9_]*$/.test(this.id.charAt(0) === "#" ? this.id.substring(1) : this.id)) {
            val.errors.push({
                message: "ID can only contain alphanumeric and underscore characters",
                loc: `${this.loc}.id`
            });
        }

        // check type
        // if array, has items. Does not have symbols or items
        if (this.type === "array") {
            if (this.items === null) {
                val.errors.push({
                    message: "Type array must have items",
                    loc: location
                });
            }
            if (this.symbols !== null) {
                val.errors.push({
                    message: "Type array must not have symbols",
                    loc: location
                });
            }
            if (this.fields !== null) {
                val.errors.push({
                    message: "Type array must not have fields",
                    loc: location
                });
            }
        }
        // if enum, has symbols. Does not have items or fields. Has name.
        if (this.type === "enum") {
            if (this.items !== null) {
                val.errors.push({
                    message: "Type enum must not have items",
                    loc: location
                });
            }
            if (this.symbols === null) {
                val.errors.push({
                    message: "Type enum must have symbols",
                    loc: location
                });
            }
            if (this.fields !== null) {
                val.errors.push({
                    message: "Type enum must not have fields",
                    loc: location
                });
            }

            if (!this.typeName) {
                val.errors.push({
                    message: "Type enum must have a name",
                    loc: location
                });
            }
        }
        // if record, has fields. Does not have items or symbols. Has name.
        if (this.type === "enum") {
            if (this.items !== null) {
                val.errors.push({
                    message: "Type record must not have items",
                    loc: location
                });
            }
            if (this.symbols === null) {
                val.errors.push({
                    message: "Type record must have symbols",
                    loc: location
                });
            }
            if (this.fields === null) {
                val.errors.push({
                    message: "Type record must have fields",
                    loc: location
                });
            } else {
                // check validity for each field.

                // val.error.concat(this.fields.map(field => {
                //     return field.validate().map((err, index) => {
                //         err.location.replace(/<fieldIndex>/, index.toString());
                //         err.location = "inputs[<inputIndex>]" + err.location;
                //         return err;
                //     });
                // }).reduce((acc, curr) => acc.concat(curr)));

                // @todo check uniqueness of each field name
            }

            if (!this.typeName) {
                val.errors.push({
                    message: "Type record must have a name",
                    loc: location
                });
            }
        }

        const errors = this.validation.errors.concat(val.errors);
        const warnings = this.validation.warnings.concat(val.warnings);

        this.validation = {errors, warnings};

        return this.validation;
    }
}