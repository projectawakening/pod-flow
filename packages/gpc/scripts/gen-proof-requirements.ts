import fs from 'fs/promises';
import path from 'path';
import {
  GPCProofConfig,
  GPCProofInputs,  // Need the input type
} from '@pcd/gpc';
import {
  POD, 
  JSONPOD, 
  PODValue, 
  requireType, 
  checkPODName,
  calcMinMerkleDepthForEntries,
  checkPODValue,
  podValueHash,
  isPODArithmeticValue,
  getRequiredPODValueForCircuit,
  printPODValueOrTuple,
  applyOrMap,
  POD_INT_MIN,
  POD_INT_MAX,
  POD_NAME_REGEX,
  encodePublicKey,
  EDDSA_PUBKEY_TYPE_STRING
} from '@pcd/pod';
import isEqual from 'lodash/isEqual';
import uniq from 'lodash/uniq';
import min from 'lodash/min';
import max from 'lodash/max';

// Base directory constants (optional but good practice)
// const CONFIGS_BASE_DIR = path.resolve(__dirname, '..', 'proof-configs');
const PROOF_REQUIREMENTS_BASE_DIR = path.resolve(__dirname, '..', 'proof-requirements');

// Type for the requirements object we will output
interface GPCRequirements {
    nObjects: number;
    nEntries: number; // Based on config? Or actual? Let's take from circuitDesc
    merkleMaxDepth: number; // Based on actual 
    nNumericValues: number;
    nEntryInequalities: number;
    nLists: number;
    maxListSize: number;
    tupleArities: Record<string, number>; 
    includeOwnerV3: boolean;
    includeOwnerV4: boolean;
}

// +++ START COPIED LOGIC from @pcd/gpc +++

// --- Constants (from gpcTypes.js / gpcUtil.js) ---
const SEMAPHORE_V3 = "SemaphoreV3";
const SEMAPHORE_V4 = "SemaphoreV4";
const TUPLE_PREFIX = "$tuple";
const LIST_MEMBERSHIP = "membership";
const LIST_NONMEMBERSHIP = "non-membership";
// Regex matching legal names for POD virtual entries. Matches `PODVirtualEntryName`.
const POD_VIRTUAL_NAME_REGEX = new RegExp(/^\$(signerPublicKey|contentID)$/);
// Regex matching legal entry identifiers for virtual POD entries.
const POD_VIRTUAL_ENTRY_IDENTIFIER_REGEX = new RegExp(/([A-Za-z_]\w*)\.\$(signerPublicKey|contentID)$/);

// --- gpcUtil.js Functions ---

/** GPCRequirements constructor. */
function GPCRequirements(
    nObjects: number,
    nEntries: number,
    merkleMaxDepth: number,
    nNumericValues = 0,
    nEntryInequalities = 0,
    nLists = 0,
    maxListSize = 0,
    tupleArities: Record<string, number> = {},
    includeOwnerV3 = false,
    includeOwnerV4 = false
): GPCRequirements {
    return {
        nObjects,
        nEntries,
        merkleMaxDepth,
        nNumericValues,
        nEntryInequalities,
        nLists,
        maxListSize,
        tupleArities,
        includeOwnerV3,
        includeOwnerV4
    };
}

/** Checks POD entry name format. */
function checkPODEntryNameLocal(name: string | undefined, strict?: boolean): string {
    if (!name) {
        throw new TypeError("POD entry names cannot be undefined.");
    } else if (!strict && name.match(POD_VIRTUAL_NAME_REGEX) !== null) {
        return name;
    } else {
        // Use the imported checkPODName from @pcd/pod for the regex check
        return checkPODName(name); 
    }
}

/** Checks POD entry identifier format and returns parts. */
function checkPODEntryIdentifierPartsLocal(nameForErrorMessages: string, entryIdentifier: string): [string, string] {
    requireType(nameForErrorMessages, entryIdentifier, "string");
    const parts = entryIdentifier.split(".");
    if (parts.length !== 2) {
        throw new TypeError(`Invalid entry identifier in ${nameForErrorMessages}. Must have the form "objName.entryName".`);
    }
    return [checkPODName(parts[0]), checkPODEntryNameLocal(parts[1])];
}

/** Splits POD entry identifier. */
function splitPODEntryIdentifierLocal(entryIdentifier: string): { objName: string; entryName: string } {
    const names = checkPODEntryIdentifierPartsLocal(entryIdentifier, entryIdentifier);
    return { objName: names[0], entryName: names[1] };
}

/** Resolves POD entry name to value. */
function resolvePODEntryLocal(entryName: string, pod: POD | undefined): PODValue | undefined {
    if (entryName.match(POD_NAME_REGEX) !== null) {
        return pod?.content?.getValue(entryName);
    }
    switch (entryName) {
        case "$contentID":
            return pod?.contentID ? { type: "cryptographic", value: pod.contentID } : undefined;
        case "$signerPublicKey":
            // Need PODEdDSAPublicKeyValue function or recreate its logic
            // return pod?.signerPublicKey ? PODEdDSAPublicKeyValue(pod.signerPublicKey) : undefined;
            // For now, return as basic object if it exists
             return pod?.signerPublicKey ? { type: EDDSA_PUBKEY_TYPE_STRING, value: pod.signerPublicKey } : undefined; 
    }
    return undefined;
}

/** Resolves POD entry identifier to value. */
function resolvePODEntryIdentifierLocal(entryIdentifier: string, pods: Record<string, POD>): PODValue | undefined {
    const { objName: podName, entryName: entryName } = splitPODEntryIdentifierLocal(entryIdentifier);
    const pod = pods[podName];
    return pod !== undefined ? resolvePODEntryLocal(entryName, pod) : undefined;
}

/** Checks if entry name is virtual. */
function isVirtualEntryNameLocal(entryName: string): boolean {
    return entryName.match(POD_VIRTUAL_NAME_REGEX) !== null;
}

/** Checks if entry identifier is virtual. */
function isVirtualEntryIdentifierLocal(entryIdentifier: string): boolean {
    return entryIdentifier.match(POD_VIRTUAL_ENTRY_IDENTIFIER_REGEX) !== null;
}

/** Canonicalizes bounds check config. */
function canonicalizeBoundsCheckConfigLocal(
    inRange?: { min: bigint; max: bigint },
    notInRange?: { min: bigint; max: bigint }
): Partial<{ inRange: { min: bigint; max: bigint }; notInRange: { min: bigint; max: bigint } }> {
    for (const interval of [inRange, notInRange]) {
        if (interval && interval.min > interval.max) {
            throw new Error(`Invalid bounds check interval min > max in config cannot be canonicalized.`);
        }
    }
    return {
        ...(!inRange && !notInRange
            ? {}
            : !inRange
                ? { notInRange: notInRange }
                : !notInRange
                    ? { inRange: inRange }
                    : notInRange.min > inRange.min && notInRange.max >= inRange.max
                        ? { inRange: { min: inRange.min, max: min([notInRange.min - 1n, inRange.max])! } }
                        : notInRange.min <= inRange.min && notInRange.max < inRange.max
                            ? { inRange: { min: max([notInRange.max + 1n, inRange.min])!, max: inRange.max } }
                            : { inRange: inRange, notInRange: notInRange })
    };
}

/** Checks if identifier is a tuple identifier. */
function isTupleIdentifierLocal(identifier: string): boolean {
    return identifier.startsWith(`${TUPLE_PREFIX}.`);
}

/** Resolves tuple identifier to values. */
function resolveTupleIdentifierLocal(
    tupleIdentifier: string,
    pods: Record<string, POD>,
    tuples: Record<string, { entries: string[] }>
): PODValue[] {
    const tupleName = tupleIdentifier.slice(`${TUPLE_PREFIX}.`.length);
    const tupleConfig = tuples[tupleName];
    if (!tupleConfig) {
         throw new ReferenceError(`Tuple ${tupleName} referenced by identifier ${tupleIdentifier} not found in configuration.`);
    }
    const tupleEntries = tupleConfig.entries;
    const resolution = tupleEntries.map((entryId) => resolvePODEntryIdentifierLocal(entryId, pods));
    resolution.forEach((value, i) => {
        if (value === undefined) {
            throw new ReferenceError(`POD entry value identifier ${tupleEntries[i]} in tuple ${tupleName} does not have a value.`);
        }
    });
    return resolution as PODValue[]; // Asserting type after check
}

/** Resolves entry or tuple identifier. */
function resolvePODEntryOrTupleIdentifierLocal(
    identifier: string,
    pods: Record<string, POD>,
    tuples?: Record<string, { entries: string[] }>
): PODValue | PODValue[] | undefined {
    return isTupleIdentifierLocal(identifier)
        ? (() => {
            if (tuples === undefined) {
                throw new ReferenceError(`Identifier ${identifier} refers to tuple but proof configuration does not specify any.`);
            } else {
                return resolveTupleIdentifierLocal(identifier, pods, tuples);
            }
        })()
        : resolvePODEntryIdentifierLocal(identifier, pods);
}

/** Gets width of entry or tuple value. */
function widthOfEntryOrTupleLocal(value: PODValue | PODValue[]): number {
    return Array.isArray(value) ? value.length : 1;
}

/** Adds identifier to list config. */
function addIdentifierToListConfigLocal(
    gpcListConfig: Record<string, { type: string; listIdentifier: string }>,
    entryConfig: any, // Use any for flexibility with entry/tuple config types
    identifier: string
) {
    if (entryConfig?.isMemberOf === undefined && entryConfig?.isNotMemberOf === undefined) {
        return;
    }
    if (entryConfig.isMemberOf !== undefined && entryConfig.isNotMemberOf !== undefined) {
        throw new Error(`Both membership and non-membership lists are specified in the configuration of ${identifier}.`);
    }
    const membershipType = entryConfig.isMemberOf !== undefined ? LIST_MEMBERSHIP : LIST_NONMEMBERSHIP;
    const listIdentifier = checkPODName(
        membershipType === LIST_MEMBERSHIP ? entryConfig.isMemberOf : entryConfig.isNotMemberOf
    );
    gpcListConfig[identifier] = { type: membershipType, listIdentifier };
}

/** Generates list config from proof config. */
function listConfigFromProofConfigLocal(
    proofConfig: GPCProofConfig
): Record<string, { type: string; listIdentifier: string }> {
    const gpcListConfig: Record<string, { type: string; listIdentifier: string }> = {};
    for (const podName of Object.keys(proofConfig.pods)) {
        const pod = proofConfig.pods[podName];
        addIdentifierToListConfigLocal(gpcListConfig, pod.contentID, `${podName}.$contentID`);
        addIdentifierToListConfigLocal(gpcListConfig, pod.signerPublicKey, `${podName}.$signerPublicKey`);
        for (const entryName of Object.keys(pod.entries)) {
            const entryConfig = pod.entries[entryName];
            addIdentifierToListConfigLocal(gpcListConfig, entryConfig, `${podName}.${entryName}`);
        }
    }
    for (const tupleName of Object.keys(proofConfig.tuples ?? {})) {
        const tupleConfig = (proofConfig.tuples ?? {})[tupleName];
        addIdentifierToListConfigLocal(gpcListConfig, tupleConfig, `${TUPLE_PREFIX}.${tupleName}`);
    }
    return gpcListConfig;
}


// --- gpcChecks.js Functions ---

/** Checks validity of entry config. */
function checkProofEntryConfigLocal(nameForErrorMessages: string, entryConfig: any): {
    hasOwnerV3Check: boolean;
    hasOwnerV4Check: boolean;
    nBoundsChecks: number;
    inequalityChecks: Record<string, string>;
} {
    requireType(`${nameForErrorMessages}.isRevealed`, entryConfig.isRevealed, "boolean");
    const isVirtualEntry = isVirtualEntryIdentifierLocal(nameForErrorMessages);
    if (entryConfig.isOwnerID !== undefined) {
        if (isVirtualEntry) throw new Error("Can't use isOwnerID on a virtual entry.");
        if (![SEMAPHORE_V3, SEMAPHORE_V4].includes(entryConfig.isOwnerID)) throw new TypeError(`Invalid owner ID type ${entryConfig.isOwnerID}.`);
        if (entryConfig.equalsEntry !== undefined) throw new Error("Can't use isOwnerID and equalsEntry on the same entry.");
        if (entryConfig.notEqualsEntry !== undefined) throw new Error("Can't use isOwnerID and notEqualsEntry on the same entry.");
    }
    if (entryConfig.equalsEntry !== undefined && entryConfig.notEqualsEntry !== undefined) throw new Error("Can't use equalsEntry and notEqualsEntry on the same entry.");
    if (entryConfig.equalsEntry !== undefined) checkPODEntryIdentifierPartsLocal(`${nameForErrorMessages}.equalsEntry`, entryConfig.equalsEntry);
    if (entryConfig.notEqualsEntry !== undefined) checkPODEntryIdentifierPartsLocal(`${nameForErrorMessages}.notEqualsEntry`, entryConfig.notEqualsEntry);
    
    const nBoundsChecks = checkProofEntryBoundsCheckConfigLocal(nameForErrorMessages, entryConfig, isVirtualEntry);
    const inequalityChecks = checkProofEntryInequalityConfigLocal(nameForErrorMessages, entryConfig, isVirtualEntry);
    const hasOwnerV3Check = entryConfig.isOwnerID === SEMAPHORE_V3;
    const hasOwnerV4Check = entryConfig.isOwnerID === SEMAPHORE_V4;
    return { hasOwnerV3Check, hasOwnerV4Check, nBoundsChecks, inequalityChecks };
}

/** Checks bounds check config. */
function checkProofEntryBoundsCheckConfigLocal(nameForErrorMessages: string, entryConfig: any, isVirtualEntry: boolean): number {
    if (isVirtualEntry) {
        if (entryConfig.inRange !== undefined || entryConfig.notInRange !== undefined) {
            throw new TypeError(`Range constraints are not allowed on virtual entry ${nameForErrorMessages}.`);
        }
        return 0;
    }
    const boundsCheckConfig = canonicalizeBoundsCheckConfigLocal(entryConfig.inRange, entryConfig.notInRange);
    let nBoundsChecks = 0;
    for (const [checkType, inRange] of [["bounds check", boundsCheckConfig.inRange], ["out of bounds check", boundsCheckConfig.notInRange]]) {
        if (typeof inRange === 'object' && inRange !== null && 'min' in inRange && 'max' in inRange) { 
            if (inRange.min < POD_INT_MIN) throw new RangeError(`Min value of ${checkType} for entry ${nameForErrorMessages} < ${POD_INT_MIN}.`);
            if (inRange.max > POD_INT_MAX) throw new RangeError(`Max value of ${checkType} for entry ${nameForErrorMessages} > ${POD_INT_MAX}.`);
            if (inRange.max < inRange.min) throw new Error(`Min value of ${checkType} for entry ${nameForErrorMessages} must be <= max.`);
            nBoundsChecks += 1;
        }
    }
    if (typeof boundsCheckConfig.inRange === 'object' && boundsCheckConfig.inRange !== null && 
        typeof boundsCheckConfig.notInRange === 'object' && boundsCheckConfig.notInRange !== null &&
        boundsCheckConfig.inRange.min >= boundsCheckConfig.notInRange.min && 
        boundsCheckConfig.inRange.max <= boundsCheckConfig.notInRange.max) {
        throw new Error(`Range constraints for ${nameForErrorMessages} are incompatible.`);
    }
    return nBoundsChecks;
}

/** Checks entry inequality config. */
function checkProofEntryInequalityConfigLocal(entryIdentifier: string, entryConfig: any, isVirtualEntry: boolean): Record<string, string> {
    if (isVirtualEntry) {
        if (entryConfig.lessThan || entryConfig.lessThanEq || entryConfig.greaterThan || entryConfig.greaterThanEq) {
            throw new TypeError(`Inequality constraints not allowed on virtual entry ${entryIdentifier}.`);
        }
        return {};
    }
    return Object.fromEntries(["lessThan", "lessThanEq", "greaterThan", "greaterThanEq"].flatMap((ineqCheck) => {
        const otherEntryIdentifier = entryConfig[ineqCheck];
        if (otherEntryIdentifier !== undefined) {
            checkPODEntryIdentifierPartsLocal(`${entryIdentifier}.${ineqCheck}`, otherEntryIdentifier);
            return [[ineqCheck, otherEntryIdentifier]];
        }
        return [];
    }));
}

/** Checks bounds check config for entry inequality config. */
function checkProofBoundsCheckConfigForEntryInequalityConfigLocal(boundsChecks: Record<string, number>, entryInequalityChecks: Record<string, Record<string, string>>) {
    const inequalityCheckedEntries = uniq(Object.keys(entryInequalityChecks).concat(Object.values(entryInequalityChecks).flatMap((checks) => Object.values(checks))));
    for (const entryIdentifier of inequalityCheckedEntries) {
        if (boundsChecks[entryIdentifier] === undefined) {
            throw new Error(`Entry ${entryIdentifier} requires a bounds check for entry inequality.`);
        }
    }
}

/** Checks tuple config. */
function checkProofTupleConfigLocal(proofConfig: GPCProofConfig) {
    for (const [tupleName, tupleConfig] of Object.entries(proofConfig.tuples ?? {})) {
        if (tupleConfig.entries.length < 2) throw new TypeError(`Tuple ${tupleName} must have arity >= 2.`);
        for (const entryId of tupleConfig.entries) {
            checkPODEntryIdentifierExistsLocal(tupleName, entryId, proofConfig.pods);
        }
    }
}

/** Checks POD entry identifier exists for tuple checking. */
function checkPODEntryIdentifierExistsLocal(tupleNameForErrorMessages: string, entryIdentifier: string, pods: Record<string, any>) {
    const [podName, entryName] = checkPODEntryIdentifierPartsLocal(tupleNameForErrorMessages, entryIdentifier);
    const pod = pods[podName];
    if (pod === undefined) throw new ReferenceError(`Tuple ${tupleNameForErrorMessages} refers to entry in non-existent POD ${podName}.`);
    if (!isVirtualEntryNameLocal(entryName)) {
        const entry = pod.entries[entryName];
        if (entry === undefined) throw new ReferenceError(`Tuple ${tupleNameForErrorMessages} refers to non-existent entry ${entryName} in POD ${podName}.`);
    }
}

/** Checks list membership input. */
function checkListMembershipInputLocal(membershipLists: Record<string, (PODValue | PODValue[])[]>): Record<string, number> {
    const numListElements: Record<string, number> = {};
    for(const [name, list] of Object.entries(membershipLists)){
        numListElements[name] = list.length;
        checkPODName(name);
        if (list.length === 0) throw new Error(`Membership list ${name} is empty.`);
        for (const value of list) {
            if (Array.isArray(value) && value.length < 2) throw new TypeError(`Membership list ${name} has invalid tuple (arity < 2).`);
        }
        const expectedWidth = widthOfEntryOrTupleLocal(list[0]);
        for (const value of list.slice(1)) {
            const valueWidth = widthOfEntryOrTupleLocal(value);
            if (valueWidth !== expectedWidth) throw new TypeError(`Membership list ${name} has type mismatch (width ${expectedWidth} vs ${valueWidth}).`);
        }
    }
    return numListElements;
}

/** Checks proof object config. */
function checkProofObjConfigLocal(objName: string, objConfig: any): {
    nEntries: number;
    nBoundsChecks: Record<string, number>;
    inequalityChecks: Record<string, Record<string, string>>;
    hasOwnerV3: boolean;
    hasOwnerV4: boolean;
} {
    if (Object.keys(objConfig.entries).length === 0) throw new TypeError(`Must prove >= 1 entry in object "${objName}".`);
    let nEntries = 0;
    const nBoundsChecks: Record<string, number> = {};
    const inequalityChecks: Record<string, Record<string, string>> = {};
    let hasOwnerV3 = false;
    let hasOwnerV4 = false;
    for (const [entryName, entryConfig] of Object.entries(objConfig.entries)) {
        checkPODEntryNameLocal(entryName, true);
        const podEntryIdentifier = `${objName}.${entryName}`;
        const { nBoundsChecks: nEntryBoundsChecks, hasOwnerV3Check, hasOwnerV4Check, inequalityChecks: inequalityChecksForEntry } = checkProofEntryConfigLocal(podEntryIdentifier, entryConfig);
        nEntries++;
        if (nEntryBoundsChecks > 0) nBoundsChecks[podEntryIdentifier] = nEntryBoundsChecks;
        if (Object.keys(inequalityChecksForEntry).length > 0) inequalityChecks[podEntryIdentifier] = inequalityChecksForEntry;
        hasOwnerV3 ||= hasOwnerV3Check;
        hasOwnerV4 ||= hasOwnerV4Check;
    }
    if (objConfig.contentID !== undefined) checkProofEntryConfigLocal(`${objName}.$contentID`, objConfig.contentID);
    if (objConfig.signerPublicKey !== undefined) checkProofEntryConfigLocal(`${objName}.$signerPublicKey`, objConfig.signerPublicKey);
    return { nEntries, nBoundsChecks, inequalityChecks, hasOwnerV3, hasOwnerV4 };
}

/** Checks proof config. */
function checkProofConfigLocal(proofConfig: GPCProofConfig): GPCRequirements {
    if (proofConfig.circuitIdentifier !== undefined) requireType("circuitIdentifier", proofConfig.circuitIdentifier, "string");
    if (Object.keys(proofConfig.pods).length === 0) throw new TypeError("Must prove at least one object.");
    let totalObjects = 0, totalEntries = 0, requiredMerkleDepth = 0;
    const boundsChecks: Record<string, number> = {};
    const entryInequalityChecks: Record<string, Record<string, string>> = {};
    let includeOwnerV3 = false, includeOwnerV4 = false;

    for (const [objName, objConfig] of Object.entries(proofConfig.pods)) {
        checkPODName(objName);
        const { nEntries, nBoundsChecks: objBoundsChecks, inequalityChecks: objInequalityChecks, hasOwnerV3: objHasOwnerV3, hasOwnerV4: objHasOwnerV4 } = checkProofObjConfigLocal(objName, objConfig);
        totalObjects++;
        totalEntries += nEntries;
        requiredMerkleDepth = max([requiredMerkleDepth, calcMinMerkleDepthForEntries(nEntries)]) ?? 0;
        Object.assign(boundsChecks, objBoundsChecks);
        Object.assign(entryInequalityChecks, objInequalityChecks);
        includeOwnerV3 ||= objHasOwnerV3;
        includeOwnerV4 ||= objHasOwnerV4;
    }

    checkProofBoundsCheckConfigForEntryInequalityConfigLocal(boundsChecks, entryInequalityChecks);
    if (proofConfig.uniquePODs !== undefined) requireType("uniquePODs", proofConfig.uniquePODs, "boolean");
    if (proofConfig.tuples !== undefined) checkProofTupleConfigLocal(proofConfig);

    const nBoundsChecks = Object.values(boundsChecks).reduce((x, y) => x + y, 0);
    const nEntryInequalities = Object.values(entryInequalityChecks).map(checks => Object.keys(checks).length).reduce((x, y) => x + y, 0);
    const listConfig = listConfigFromProofConfigLocal(proofConfig);
    const numLists = Object.keys(listConfig).length;
    const maxListSize = numLists > 0 ? 1 : 0; // Simplified - input check will give better max size
    const tupleArities = Object.fromEntries(Object.entries(proofConfig.tuples ?? {}).map(pair => [pair[0], pair[1].entries.length]));

    return GPCRequirements(totalObjects, totalEntries, requiredMerkleDepth, nBoundsChecks, nEntryInequalities, numLists, maxListSize, tupleArities, includeOwnerV3, includeOwnerV4);
}

/** Checks proof inputs. */
function checkProofInputsLocal(proofInputs: GPCProofInputs): GPCRequirements {
    requireType("pods", proofInputs.pods, "object");
    let totalObjects = 0, requiredMerkleDepth = 0;
    for (const [podName, pod] of Object.entries(proofInputs.pods)) {
        checkPODName(podName);
        requireType(`pods.${podName}`, pod, "object");
        if (!(pod instanceof POD)) throw new TypeError(`pods.${podName} must be a POD object.`);
        totalObjects++;
        requiredMerkleDepth = max([requiredMerkleDepth, pod.content.merkleTreeDepth]) ?? 0;
    }
    if (proofInputs.owner !== undefined) {
        if (proofInputs.owner.semaphoreV3 !== undefined) {
            requireType(`owner.SemaphoreV3`, proofInputs.owner.semaphoreV3, "object");
            requireType(`owner.SemaphoreV3.commitment`, proofInputs.owner.semaphoreV3.commitment, "bigint");
        }
        if (proofInputs.owner.semaphoreV4 !== undefined) {
             requireType(`owner.SemaphoreV4`, proofInputs.owner.semaphoreV4, "object");
             requireType(`owner.SemaphoreV4.publicKey`, proofInputs.owner.semaphoreV4.publicKey, "array");
             if (proofInputs.owner.semaphoreV4.publicKey.length !== 2) throw new TypeError(`owner.semaphoreV4.publicKey must be Point`);
             requireType("publicKey[0]", proofInputs.owner.semaphoreV4.publicKey[0], "bigint");
             requireType("publicKey[1]", proofInputs.owner.semaphoreV4.publicKey[1], "bigint");
        }
        if (proofInputs.owner.externalNullifier !== undefined) {
            if (proofInputs.owner.semaphoreV3 === undefined && proofInputs.owner.semaphoreV4 === undefined) throw new Error(`External nullifier requires identity object.`);
            else checkPODValue("owner.externalNullifier", proofInputs.owner.externalNullifier);
        }
    }
    const numListElements = proofInputs.membershipLists === undefined ? {} : checkListMembershipInputLocal(proofInputs.membershipLists);
    const maxListSize = numListElements && Object.keys(numListElements).length > 0 ? max(Object.values(numListElements)) ?? 0 : 0;
    if (proofInputs.watermark !== undefined) checkPODValue("watermark", proofInputs.watermark);
    return GPCRequirements(totalObjects, totalObjects, requiredMerkleDepth, 0, 0, 0, maxListSize, {});
}

/** Checks correspondence between proof config and inputs. */
function checkProofInputsForConfigLocal(proofConfig: GPCProofConfig, proofInputs: GPCProofInputs) {
    const nConfiguredObjects = Object.keys(proofConfig.pods).length;
    const nInputObjects = Object.keys(proofInputs.pods).length;
    if (nConfiguredObjects !== nInputObjects) throw new Error(`Input/Config object count mismatch: ${nInputObjects} vs ${nConfiguredObjects}.`);
    let hasOwnerEntry = false;
    for (const [objName, objConfig] of Object.entries(proofConfig.pods)) {
        const pod = proofInputs.pods[objName];
        if (pod === undefined) throw new ReferenceError(`Configured POD ${objName} not in inputs.`);
        for (const [entryName, entryConfig] of Object.entries(objConfig.entries)) {
            const podValue = resolvePODEntryLocal(entryName, pod);
            if (podValue === undefined) throw new ReferenceError(`Configured entry ${objName}.${entryName} not in input.`);
            if (entryConfig.isOwnerID !== undefined) {
                hasOwnerEntry = true;
                if (!proofInputs.owner?.semaphoreV3 && !proofInputs.owner?.semaphoreV4) throw new Error("Config expects owner, but none provided.");
                for (const [ownerIDType, ownerID] of [[SEMAPHORE_V3, proofInputs.owner.semaphoreV3?.commitment], [SEMAPHORE_V4, proofInputs.owner.semaphoreV4?.publicKey ? encodePublicKey(proofInputs.owner.semaphoreV4.publicKey) : undefined]]) {
                    if (entryConfig.isOwnerID === ownerIDType) {
                        if (ownerID === undefined) throw new ReferenceError(`Config owner commitment references missing identity.`);
                        if ((ownerIDType === SEMAPHORE_V3 && podValue.type !== "cryptographic") || (ownerIDType === SEMAPHORE_V4 && podValue.type !== EDDSA_PUBKEY_TYPE_STRING)) throw new Error("Owner ID type mismatch (V3 crypto, V4 EdDSA pubkey).");
                        if (podValue.value !== ownerID) throw new Error(`Config owner commitment doesn't match identity.`);
                        break;
                    }
                }
            }
            const entryEqConfig = entryConfig.equalsEntry || entryConfig.notEqualsEntry;
            if (entryEqConfig !== undefined) {
                const qualifier = entryConfig.notEqualsEntry ? " not " : " ";
                const otherValue = resolvePODEntryIdentifierLocal(entryEqConfig, proofInputs.pods);
                if (otherValue === undefined) throw new ReferenceError(`Entry ${objName}.${entryName} eq check against non-existent ${entryEqConfig}.`);
                const eqCheck = podValueHash(otherValue) === podValueHash(podValue);
                if ((entryConfig.equalsEntry && !eqCheck) || (entryConfig.notEqualsEntry && eqCheck)) throw new Error(`Entry ${objName}.${entryName} does${qualifier}equal ${entryEqConfig}.`);
            }
            checkProofBoundsCheckInputsForConfigLocal(`${objName}.${entryName}`, entryConfig, podValue);
            checkProofEntryInequalityInputsForConfigLocal(`${objName}.${entryName}`, entryConfig, podValue, proofInputs.pods);
        }
    }
    if (proofInputs.owner?.externalNullifier !== undefined && !hasOwnerEntry) throw new Error("Nullifier requires an entry containing owner ID.");
    checkProofPODUniquenessInputsForConfigLocal(proofConfig, proofInputs);
    checkProofListMembershipInputsForConfigLocal(proofConfig, proofInputs);
}

/** Checks POD uniqueness input against config. */
function checkProofPODUniquenessInputsForConfigLocal(proofConfig: GPCProofConfig, proofInputs: GPCProofInputs) {
    if (proofConfig.uniquePODs) {
        const contentIDs = Object.values(proofInputs.pods).map(pod => pod.contentID);
        const uniqueContentIDs = uniq(contentIDs);
        if (!isEqual(contentIDs.slice().sort(), uniqueContentIDs.slice().sort())) throw new Error("Config requires unique POD content IDs, but inputs have duplicates.");
    }
}

/** Checks bounds check inputs against config. */
function checkProofBoundsCheckInputsForConfigLocal(entryName: string, entryConfig: any, entryValue: PODValue) {
    if (entryConfig.inRange !== undefined) {
        if (!isPODArithmeticValue(entryValue)) throw new TypeError(`Entry ${entryName} bounds check requires arithmetic type.`);
        const numericValue = getRequiredPODValueForCircuit(entryValue, entryName); // Throws if not possible
        if (numericValue < entryConfig.inRange.min) throw new RangeError(`Entry ${entryName} < min ${entryConfig.inRange.min}.`);
        if (numericValue > entryConfig.inRange.max) throw new RangeError(`Entry ${entryName} > max ${entryConfig.inRange.max}.`);
    }
    if (entryConfig.notInRange !== undefined) {
        if (!isPODArithmeticValue(entryValue)) throw new TypeError(`Entry ${entryName} bounds check requires arithmetic type.`);
        const numericValue = getRequiredPODValueForCircuit(entryValue, entryName);
        if (entryConfig.notInRange.min <= numericValue && numericValue <= entryConfig.notInRange.max) {
            throw new RangeError(`Entry ${entryName} in forbidden range [${entryConfig.notInRange.min}, ${entryConfig.notInRange.max}].`);
        }
    }
}

/** Checks entry inequality inputs against config. */
function checkProofEntryInequalityInputsForConfigLocal(entryName: string, entryConfig: any, entryValue: PODValue, pods: Record<string, POD>) {
    const checks = [
        ["less than", entryConfig.lessThan, (x: bigint, y: bigint) => x < y],
        ["less than or equal to", entryConfig.lessThanEq, (x: bigint, y: bigint) => x <= y],
        ["greater than", entryConfig.greaterThan, (x: bigint, y: bigint) => x > y],
        ["greater than or equal to", entryConfig.greaterThanEq, (x: bigint, y: bigint) => x >= y]
    ];
    for (const [type, otherId, cmp] of checks) {
        if (otherId !== undefined) {
            const otherVal = resolvePODEntryIdentifierLocal(otherId, pods);
            if (!otherVal || !isPODArithmeticValue(entryValue) || !isPODArithmeticValue(otherVal)) {
                throw new TypeError(`Inequality check between ${entryName} and ${otherId} requires both to be arithmetic values.`);
            }
            const numVal = getRequiredPODValueForCircuit(entryValue, entryName);
            const otherNumVal = getRequiredPODValueForCircuit(otherVal, otherId);
            if (!cmp(numVal, otherNumVal)) throw new Error(`Input ${entryName} should be ${type} ${otherId}, but is not.`);
        }
    }
}

/** Checks list membership inputs against config. */
function checkProofListMembershipInputsForConfigLocal(proofConfig: GPCProofConfig, proofInputs: GPCProofInputs) {
    const listConfig = listConfigFromProofConfigLocal(proofConfig);
    checkInputListNamesForConfigLocal(listConfig, Object.keys(proofInputs.membershipLists ?? {}));
    if (proofInputs.membershipLists) {
        for (const [comparisonId, { type: membershipIndicator, listIdentifier }] of Object.entries(listConfig)) {
            const inputList = proofInputs.membershipLists[listIdentifier];
            const comparisonValue = resolvePODEntryOrTupleIdentifierLocal(comparisonId, proofInputs.pods, proofConfig.tuples);
            if (comparisonValue === undefined) throw new ReferenceError(`Comparison value ${comparisonId} for list ${listIdentifier} not in input.`);
            const compWidth = widthOfEntryOrTupleLocal(comparisonValue);
            for (const elem of inputList) {
                if (widthOfEntryOrTupleLocal(elem) !== compWidth) throw new TypeError(`List ${listIdentifier} width mismatch.`);
            }
            const hashCompare = (val: any) => applyOrMap(podValueHash, val);
            const comparisonHash = hashCompare(comparisonValue);
            const isInList = inputList.some(elem => isEqual(hashCompare(elem), comparisonHash));
            if (membershipIndicator === LIST_MEMBERSHIP && !isInList) throw new Error(`Value ${printPODValueOrTuple(comparisonValue)} (${comparisonId}) not in list ${listIdentifier}.`);
            if (membershipIndicator === LIST_NONMEMBERSHIP && isInList) throw new Error(`Value ${printPODValueOrTuple(comparisonValue)} (${comparisonId}) is in list ${listIdentifier}.`);
        }
    }
}

/** Checks input list names against config list names. */
function checkInputListNamesForConfigLocal(listConfig: Record<string, { listIdentifier: string }>, listNames: string[]) {
    const configListNames = new Set(Object.values(listConfig).map(config => config.listIdentifier));
    const inputListNames = new Set(listNames);
    if (!isEqual(configListNames, inputListNames)) {
        throw new Error(`Config/Input list name mismatch: ${JSON.stringify([...configListNames])} vs ${JSON.stringify([...inputListNames])}.`);
    }
}

/** Merges two GPCRequirements objects. */
function mergeRequirementsLocal(rs1: GPCRequirements, rs2: GPCRequirements): GPCRequirements {
    if (Object.keys(rs1.tupleArities).length > 0 && Object.keys(rs2.tupleArities).length > 0) throw new Error(`Cannot merge requirements with conflicting tuple arities.`);
    const tupleArities = Object.keys(rs1.tupleArities).length === 0 ? rs2.tupleArities : rs1.tupleArities;
    return GPCRequirements(
        max([rs1.nObjects, rs2.nObjects]) ?? 0,
        max([rs1.nEntries, rs2.nEntries]) ?? 0,
        max([rs1.merkleMaxDepth, rs2.merkleMaxDepth]) ?? 0,
        max([rs1.nNumericValues, rs2.nNumericValues]) ?? 0,
        max([rs1.nEntryInequalities, rs2.nEntryInequalities]) ?? 0,
        max([rs1.nLists, rs2.nLists]) ?? 0,
        max([rs1.maxListSize, rs2.maxListSize]) ?? 0,
        tupleArities,
        rs1.includeOwnerV3 || rs2.includeOwnerV3,
        rs1.includeOwnerV4 || rs2.includeOwnerV4
    );
}

/** The main check function, replicating the logic from @pcd/gpc */
function checkProofArgsLocal(proofConfig: GPCProofConfig, proofInputs: GPCProofInputs): GPCRequirements {
    const configReq = checkProofConfigLocal(proofConfig);
    const inputReq = checkProofInputsLocal(proofInputs);
    const circuitReq = mergeRequirementsLocal(configReq, inputReq);
    checkProofInputsForConfigLocal(proofConfig, proofInputs);
    return circuitReq;
}

// +++ END COPIED LOGIC +++


// Helper to serialize BigInts in JSON (for output)
function toJson(data: any): string {
  return JSON.stringify(
    data,
    (key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2
  );
}

// BigInt Reviver for JSON parsing input PODs
function jsonBigIntReviver(key: string, value: any): any {
    if (typeof value === 'string' && /^\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
    }
    if (typeof value === 'object' && value !== null && value.type === 'bigint' && typeof value.value === 'string') {
        try {
            return BigInt(value.value);
        } catch { /* Ignore */ }
    }
    return value;
}

// Main script logic
async function generateRequirementsData(configFilePath: string, inputPodsFilePath: string) {
  console.log(`Generating requirements data using config: ${configFilePath}`); // Keep this initial log
  // console.log(`Using input PODs file: ${inputPodsFilePath}`); // This part is redundant

  if (!configFilePath || !inputPodsFilePath) {
    console.error("Error: Both config path and input PODs path arguments are required.");
    console.error(`Usage: ts-node ${path.basename(__filename)} <path/to/config.ts> <path/to/input_pods.json>`);
    // Clarify only where the config file is expected
    console.error(`       (Config file assumed to be within ${PROOF_REQUIREMENTS_BASE_DIR})`);
    process.exit(1);
  }

  // --- Load Config ---
  // Use the provided configFilePath directly, resolving it relative to CWD
  const absoluteConfigPath = path.resolve(process.cwd(), configFilePath);
  const configFileName = path.basename(absoluteConfigPath); // Get filename for logging/output if needed
  // console.log(`Attempting to load config from resolved path: ${absoluteConfigPath}`);
  let proofConfig: GPCProofConfig;
  try {
    const configModule = require(absoluteConfigPath); // require the correctly resolved path
    const exportKey = Object.keys(configModule)[0];
    proofConfig = configModule[exportKey];
    if (!proofConfig || !proofConfig.pods) {
        throw new Error(`Could not find exported config with a 'pods' property.`);
    }
     // console.log(`Successfully loaded config: ${exportKey}`);
  } catch (error: any) {
    console.error(`Error loading proof config from ${absoluteConfigPath}: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }

  // --- Load and Deserialize Input PODs ---
  // Use the provided input PODs path directly. Resolve it relative to CWD if it's not absolute.
  const absoluteInputPodsPath = path.resolve(process.cwd(), inputPodsFilePath); // Resolve against CWD
  // console.log(`Attempting to load and deserialize input PODs directly from: ${absoluteInputPodsPath}`);
  let proofInputs: GPCProofInputs;
  try {
      // Use the resolved absolute path
      const inputFileContent = await fs.readFile(absoluteInputPodsPath, 'utf-8');
      // Parse the input file as an ARRAY of JSON PODs
      const inputPodsJSON: JSONPOD[] = JSON.parse(inputFileContent, jsonBigIntReviver);
      
      // Verify count matches config
      const configPodKeys = Object.keys(proofConfig.pods);
      if (inputPodsJSON.length !== configPodKeys.length) {
          throw new Error(`Number of PODs in input file (${inputPodsJSON.length}) does not match config (${configPodKeys.length}).`);
      }

      // Create the mappedPods record by deserializing
      const mappedPods: Record<string, POD> = {};
      for (let i = 0; i < configPodKeys.length; i++) {
          const podKey = configPodKeys[i];
          const jsonPod = inputPodsJSON[i];
          try {
              mappedPods[podKey] = POD.fromJSON(jsonPod);
          } catch (deserializeError: any) {
              throw new Error(`Failed to deserialize POD at index ${i} (for key '${podKey}'): ${deserializeError.message}`);
          }
      }
      
      // Now construct the GPCProofInputs object correctly
      proofInputs = {
          pods: mappedPods
          // Add owner/watermark/lists here if they were loaded from elsewhere
      };
      // console.log(`Successfully loaded and deserialized ${configPodKeys.length} PODs.`);

  } catch (error: any) {
      console.error(`Error loading/deserializing input PODs file ${absoluteInputPodsPath}: ${error.message}`);
      process.exit(1);
  }

  // --- Call the LOCAL checkProofArgs function ---
  // console.log("Calling LOCAL checkProofArgs to determine actual requirements...");
  let requirements: GPCRequirements;
  try {
      requirements = checkProofArgsLocal(proofConfig, proofInputs); // Call the copied version
      // console.log("LOCAL checkProofArgs call completed successfully.");
  } catch (error: any) {
      console.error(`Error running LOCAL checkProofArgs: ${error.message}`);
      console.error("Check compatibility between config and inputs.");
      console.error(error.stack);
      process.exit(1);
  }

  // --- Log Final Requirements ---
  // console.log("Final Requirements (from LOCAL checkProofArgs):"); // Logged before write
  // console.log(toJson(requirements));

  // --- Write Output ---
  const outputDir = PROOF_REQUIREMENTS_BASE_DIR;
  const outputFileNameBase = path.basename(configFileName, path.extname(configFileName));
  const outputPath = path.join(outputDir, `${outputFileNameBase}_requirements.json`);

  console.log(`Preparing to write requirements data to: ${outputPath}`);

  try {
    await fs.mkdir(outputDir, { recursive: true });
    const outputJson = toJson(requirements); // Use helper here too
    console.log("Calculated Requirements:", outputJson); // Log the final object before writing
    await fs.writeFile(outputPath, outputJson, 'utf-8');
    // console.log(`Successfully wrote requirements data to ${outputPath}`); // Redundant with logStep

  } catch (error: any) {
    console.error(`[Caught Error] Error writing requirements data to ${outputPath}: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// --- Script Execution ---
const args = process.argv.slice(2);
const configArg = args[0]; // Expects path to config (within configs dir eventually)
const inputPodsArg = args[1]; // Expects path to PODs (anywhere)

generateRequirementsData(configArg, inputPodsArg).catch(error => {
  console.error("Unhandled error during script execution:", error);
  process.exit(1);
}); 