import {SystemResourceValue} from "../aggregate-types";
import {Requirement} from "./requirement";
export interface ResourceRequirement extends Requirement {
    coresMin?: SystemResourceValue;

    coresMax?: SystemResourceValue;

    ramMin?: SystemResourceValue;

    ramMax?: SystemResourceValue;

    tmpdirMin?: SystemResourceValue;

    tmpdirMax?: SystemResourceValue;

    outdirMin?: SystemResourceValue;

    outdirMax?: SystemResourceValue;
}