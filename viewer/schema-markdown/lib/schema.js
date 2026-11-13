// Licensed under the MIT License
// https://github.com/craigahobbs/schema-markdown-js/blob/main/LICENSE

/** @module lib/schema */

import {typeModel} from './typeModel.js';
import {validateTypeModelErrors} from './schemaUtil.js';


/**
 * Get a user type's referenced type model
 *
 * @param {Object} types - The [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @param {string} typeName - The type name
 * @param {Object} [referencedTypes=null] - Optional map of referenced user type name to user type model
 * @returns {Object} The referenced [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 */
export function getReferencedTypes(types, typeName, referencedTypes = {}) {
    return getReferencedTypesHelper(types, {'user': typeName}, referencedTypes);
}


function getReferencedTypesHelper(types, type, referencedTypes) {
    // Array?
    if ('array' in type) {
        const {array} = type;
        getReferencedTypesHelper(types, array.type, referencedTypes);

    // Dict?
    } else if ('dict' in type) {
        const {dict} = type;
        getReferencedTypesHelper(types, dict.type, referencedTypes);
        if ('keyType' in dict) {
            getReferencedTypesHelper(types, dict.keyType, referencedTypes);
        }

    // User type?
    } else if ('user' in type) {
        const typeName = type.user;

        // Already encountered?
        if (!Object.hasOwn(referencedTypes, typeName)) {
            const userType = getUserType(types, typeName);
            setValue(referencedTypes, typeName, userType);

            // Struct?
            if ('struct' in userType) {
                const {struct} = userType;
                if ('bases' in struct) {
                    for (const base of struct.bases) {
                        getReferencedTypesHelper(types, {'user': base}, referencedTypes);
                    }
                }
                for (const member of getStructMembers(types, struct)) {
                    getReferencedTypesHelper(types, member.type, referencedTypes);
                }

            // Enum?
            } else if ('enum' in userType) {
                const enum_ = userType.enum;
                if ('bases' in enum_) {
                    for (const base of enum_.bases) {
                        getReferencedTypesHelper(types, {'user': base}, referencedTypes);
                    }
                }

            // Typedef?
            } else if ('typedef' in userType) {
                const {typedef} = userType;
                getReferencedTypesHelper(types, typedef.type, referencedTypes);

            // Action?
            } else if ('action' in userType) {
                const {action} = userType;
                if ('path' in action) {
                    getReferencedTypesHelper(types, {'user': action.path}, referencedTypes);
                }
                if ('query' in action) {
                    getReferencedTypesHelper(types, {'user': action.query}, referencedTypes);
                }
                if ('input' in action) {
                    getReferencedTypesHelper(types, {'user': action.input}, referencedTypes);
                }
                if ('output' in action) {
                    getReferencedTypesHelper(types, {'user': action.output}, referencedTypes);
                }
                if ('errors' in action) {
                    getReferencedTypesHelper(types, {'user': action.errors}, referencedTypes);
                }
            }
        }
    }

    return referencedTypes;
}


/**
 * Schema Markdown type model validation error
 *
 * @extends {Error}
 * @property {?string} memberFqn - The fully qualified member name
 */
export class ValidationError extends Error {
    /**
     * Schema Markdown type model validation error constructor
     *
     * @param {string} message - The validation error message
     * @param {string} [memberFqn=null] - The fully-qualified member name
     */
    constructor(message, memberFqn = null) {
        super(message);
        this.name = this.constructor.name;
        this.memberFqn = memberFqn;
    }
}


// Helper to look up a user type by name - throws ValidationError for unknown type names
function getUserType(types, typeName) {
    const userType = Object.hasOwn(types, typeName) ? types[typeName] : null;
    if (userType === null) {
        throw new ValidationError(`Unknown type "${typeName}"`);
    }
    return userType;
}


// Helper to set an own property on a plain-object copy - the "__proto__" key is defined directly
// since assignment would invoke the inherited prototype setter instead of creating an own property
function setValue(obj, key, value) {
    if (key === '__proto__') {
        Object.defineProperty(obj, key, {'value': value, 'enumerable': true, 'writable': true, 'configurable': true});
    } else {
        obj[key] = value;
    }
}


/**
 * Type-validate a value using a user type model. Container values are duplicated since some member types are
 * transformed during validation.
 *
 * Validates JSON-like values. In this implementation, date values are `Date` objects (time-of-day
 * cleared), datetime values are `Date` objects, and uuid strings remain strings. A `Date` input is
 * left as a `Date` (date values have time-of-day cleared). See the language documentation on
 * [built-in types]{@link https://craigahobbs.github.io/schema-markdown-js/language/#built-in-types}
 * for accepted JSON input formats and host-runtime behavior.
 *
 * @param {Object} types - The [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @param {string} typeName - The type name
 * @param {Object} value - The value object to validate
 * @param {?string} [memberFqn=null] - The fully-qualified member name
 * @returns {Object} The validated, transformed value object
 * @throws [ValidationError]{@link module:lib/schema.ValidationError}
 */
export function validateType(types, typeName, value, memberFqn = null) {
    return validateTypeHelper(types, {'user': typeName}, value, memberFqn);
}


// Helper to create a local date (midnight) - unlike new Date, years 0 through 99 aren't 1900 through 1999
function newLocalDate(year, month, day) {
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
}


// Regular expressions used by validateTypeHelper
const rDate = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})(?:T00:00(?::00(?:\.0+)?)?(?:Z|(?<tzhour>[+-]\d{2}):(?<tzminute>\d{2})))?$/;
const rDatetime = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const rUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// Default dict key type used by validateTypeHelper
const defaultDictKeyType = {'builtin': 'string'};


function validateTypeHelper(types, type, value, memberFqn) {
    let valueNew = value;

    // Built-in type?
    if ('builtin' in type) {
        const {builtin} = type;

        // string?
        if (builtin === 'string') {
            // Not a string?
            if (typeof value !== 'string') {
                throwMemberError(type, value, memberFqn);
            }

        // int or float?
        } else if (builtin === 'int' || builtin === 'float') {
            // Convert string?
            if (typeof value === 'string') {
                valueNew = parseFloat(value);
                if (isNaN(value) || !Number.isFinite(valueNew)) {
                    throwMemberError(type, value, memberFqn);
                }

            // Not a number?
            } else if (typeof value !== 'number') {
                throwMemberError(type, value, memberFqn);
            }

            // Non-int number?
            if (builtin === 'int' && Math.trunc(valueNew) !== valueNew) {
                throwMemberError(type, value, memberFqn);
            }

        // bool?
        } else if (builtin === 'bool') {
            // Convert string?
            if (typeof value === 'string') {
                if (value === 'true') {
                    valueNew = true;
                } else if (value === 'false') {
                    valueNew = false;
                } else {
                    throwMemberError(type, value, memberFqn);
                }

            // Not a bool?
            } else if (typeof value !== 'boolean') {
                throwMemberError(type, value, memberFqn);
            }

        // date?
        } else if (builtin === 'date') {
            // Convert string? A date, or a datetime at midnight in its own offset - the date is the string's date.
            if (typeof value === 'string') {
                const mDate = value.match(rDate);
                if (mDate !== null) {
                    const year = Number.parseInt(mDate.groups.year, 10);
                    const month = Number.parseInt(mDate.groups.month, 10);
                    const day = Number.parseInt(mDate.groups.day, 10);
                    const {tzhour = null, tzminute = null} = mDate.groups;
                    valueNew = newLocalDate(year, month, day);
                    // A date rolls an out-of-range month/day over (e.g. Feb 30 -> Mar 1); reject that, and an invalid offset
                    if (valueNew.getMonth() !== month - 1 ||
                        (tzhour !== null && (Math.abs(Number.parseInt(tzhour, 10)) > 23 || Number.parseInt(tzminute, 10) > 59))) {
                        throwMemberError(type, value, memberFqn);
                    }
                } else {
                    throwMemberError(type, value, memberFqn);
                }

            // Not a date - a datetime at the start of its day? A day's start is its local midnight, or its first time when a
            // timezone change skips midnight.
            } else if (!(value instanceof Date) || new Date(value).setHours(0, 0, 0, 0) !== value.getTime()) {
                throwMemberError(type, value, memberFqn);
            }

        // datetime?
        } else if (builtin === 'datetime') {
            // Convert string?
            if (typeof value === 'string') {
                const mDatetime = value.match(rDatetime);
                if (mDatetime !== null) {
                    valueNew = new Date(value);
                    const year = Number.parseInt(mDatetime.groups.year, 10);
                    const month = Number.parseInt(mDatetime.groups.month, 10);
                    const day = Number.parseInt(mDatetime.groups.day, 10);
                    // A date rolls an out-of-range day over (e.g. Feb 30 -> Mar 1); reject that
                    if (Number.isNaN(valueNew.getTime()) || newLocalDate(year, month, day).getMonth() !== month - 1) {
                        throwMemberError(type, value, memberFqn);
                    }
                } else {
                    throwMemberError(type, value, memberFqn);
                }

            // Not a datetime?
            } else if (!(value instanceof Date)) {
                throwMemberError(type, value, memberFqn);
            }

        // uuid?
        } else if (builtin === 'uuid') {
            if (typeof value !== 'string') {
                throwMemberError(type, value, memberFqn);
            }
            if (!rUuid.test(value)) {
                throwMemberError(type, value, memberFqn);
            }
        }

    // User type?
    } else if ('user' in type) {
        const userType = getUserType(types, type.user);

        // action?
        if ('action' in userType) {
            throwMemberError(type, value, memberFqn);
        }

        // typedef?
        if ('typedef' in userType) {
            const {typedef} = userType;
            const typedefAttr = 'attr' in typedef ? typedef.attr : null;

            // Validate the value
            const valueNullable = typedefAttr !== null && 'nullable' in typedefAttr && typedefAttr.nullable;
            if (valueNullable && (value === null || value === 'null')) {
                valueNew = null;
            } else {
                valueNew = validateTypeHelper(types, typedef.type, value, memberFqn);
                if (typedefAttr !== null) {
                    validateAttr(type, typedefAttr, valueNew, memberFqn);
                }
            }

        // enum?
        } else if ('enum' in userType) {
            const enum_ = userType.enum;

            // Not a valid enum value?
            if (!getEnumValues(types, enum_).some((enumValue) => value === enumValue.name)) {
                throwMemberError(type, value, memberFqn);
            }

        // struct?
        } else if ('struct' in userType) {
            const {struct} = userType;

            // Valid value type?
            if (value === '') {
                valueNew = {};
            } else if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                throwMemberError({'user': struct.name}, value, memberFqn);
            }

            // Valid union?
            const isMap = valueNew instanceof Map;
            const isUnion = 'union' in struct ? struct.union : false;
            if (isUnion) {
                if ((isMap ? valueNew.size : Object.keys(valueNew).length) !== 1) {
                    throwMemberError({'user': struct.name}, value, memberFqn);
                }
            }

            // Validate the struct members
            const valueCopy = isMap ? new Map() : {};
            for (const member of getStructMembers(types, struct)) {
                const memberName = member.name;
                const memberFqnMember = [memberFqn, memberName];
                const memberOptional = 'optional' in member && member.optional;
                const memberAttr = 'attr' in member ? member.attr : null;

                // Missing non-optional member? Check own properties only - "in" matches inherited
                // Object.prototype properties for member names like "constructor"
                if (!(isMap ? valueNew.has(memberName) : Object.hasOwn(valueNew, memberName))) {
                    if (!memberOptional && !isUnion) {
                        throw new ValidationError(`Required member "${memberFqnStr(memberFqnMember)}" missing`);
                    }
                } else {
                    // Validate the member value
                    let memberValue = isMap ? valueNew.get(memberName) : valueNew[memberName];

                    // No member attributes? Validate the member value directly
                    if (memberAttr === null) {
                        memberValue = validateTypeHelper(types, member.type, memberValue, memberFqnMember);

                    // Nullable null?
                    } else if ('nullable' in memberAttr && memberAttr.nullable &&
                               (memberValue === null || memberValue === 'null')) {
                        memberValue = null;
                    } else {
                        memberValue = validateTypeHelper(types, member.type, memberValue, memberFqnMember);
                        validateAttr(member.type, memberAttr, memberValue, memberFqnMember);
                    }

                    // Copy the validated member
                    if (isMap) {
                        valueCopy.set(memberName, memberValue);
                    } else {
                        setValue(valueCopy, memberName, memberValue);
                    }
                }
            }

            // Any unknown members?
            const valueCopyCount = isMap ? valueCopy.size : Object.keys(valueCopy).length;
            const valueNewCount = isMap ? valueNew.size : Object.keys(valueNew).length;
            if (valueCopyCount !== valueNewCount) {
                const memberSet = new Set(getStructMembers(types, struct).map((member) => member.name));
                const valueNewKeys = isMap ? Array.from(valueNew.keys()) : Object.keys(valueNew);
                const [unknownKey] = valueNewKeys.filter((key) => !memberSet.has(key));
                const unknownFqn = memberFqnStr([memberFqn, unknownKey]);
                throw new ValidationError(`Unknown member "${unknownFqn.slice(0, 100)}"`);
            }

            // Return the validated, transformed copy
            valueNew = valueCopy;
        }

    // array?
    } else if ('array' in type) {
        // Valid value type?
        const {array} = type;
        const arrayType = array.type;
        const arrayAttr = 'attr' in array ? array.attr : null;
        if (value === '') {
            valueNew = [];
        } else if (!Array.isArray(value)) {
            throwMemberError(type, value, memberFqn);
        }

        // Validate the list contents
        const valueCopy = [];
        const arrayValueNullable = arrayAttr !== null && 'nullable' in arrayAttr && arrayAttr.nullable;
        for (let ixArrayValue = 0; ixArrayValue < valueNew.length; ixArrayValue++) {
            const memberFqnValue = [memberFqn, ixArrayValue];
            let arrayValue = valueNew[ixArrayValue];
            if (arrayValueNullable && (arrayValue === null || arrayValue === 'null')) {
                arrayValue = null;
            } else {
                arrayValue = validateTypeHelper(types, arrayType, arrayValue, memberFqnValue);
                if (arrayAttr !== null) {
                    validateAttr(arrayType, arrayAttr, arrayValue, memberFqnValue);
                }
            }
            valueCopy.push(arrayValue);
        }

        // Return the validated, transformed copy
        valueNew = valueCopy;

    // dict?
    } else if ('dict' in type) {
        // Valid value type?
        const {dict} = type;
        const dictType = dict.type;
        const dictAttr = 'attr' in dict ? dict.attr : null;
        const dictKeyType = 'keyType' in dict ? dict.keyType : defaultDictKeyType;
        const dictKeyAttr = 'keyAttr' in dict ? dict.keyAttr : null;
        if (value === '') {
            valueNew = {};
        } else if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throwMemberError(type, value, memberFqn);
        }

        // Validate the dict key/value pairs
        const isMap = valueNew instanceof Map;
        const valueCopy = isMap ? new Map() : {};
        const dictKeyNullable = dictKeyAttr !== null && 'nullable' in dictKeyAttr && dictKeyAttr.nullable;
        const dictValueNullable = dictAttr !== null && 'nullable' in dictAttr && dictAttr.nullable;
        for (let [dictKey, dictValue] of (isMap ? valueNew.entries() : Object.entries(valueNew))) {
            const memberFqnKey = [memberFqn, dictKey];

            // Validate the key
            if (dictKeyNullable && (dictKey === null || dictKey === 'null')) {
                dictKey = null;
            } else {
                dictKey = validateTypeHelper(types, dictKeyType, dictKey, memberFqn);
                if (dictKeyAttr !== null) {
                    validateAttr(dictKeyType, dictKeyAttr, dictKey, memberFqn);
                }
            }

            // Validate the value
            if (dictValueNullable && (dictValue === null || dictValue === 'null')) {
                dictValue = null;
            } else {
                dictValue = validateTypeHelper(types, dictType, dictValue, memberFqnKey);
                if (dictAttr !== null) {
                    validateAttr(dictType, dictAttr, dictValue, memberFqnKey);
                }
            }

            // Copy the key/value
            if (isMap) {
                valueCopy.set(dictKey, dictValue);
            } else {
                setValue(valueCopy, dictKey, dictValue);
            }
        }

        // Return the validated, transformed copy
        valueNew = valueCopy;
    }

    return valueNew;
}


// Helper to materialize a member's fully-qualified name string. For performance, member FQNs are
// built lazily as [parent, key] pairs and only converted to strings on error.
function memberFqnStr(memberFqn) {
    if (memberFqn === null || typeof memberFqn === 'string') {
        return memberFqn;
    }
    const parts = [];
    let fqnPart = memberFqn;
    while (Array.isArray(fqnPart)) {
        parts.push(`${fqnPart[1]}`);
        [fqnPart] = fqnPart;
    }
    if (fqnPart !== null) {
        parts.push(`${fqnPart}`);
    }
    parts.reverse();
    return parts.join('.');
}


function throwMemberError(type, value, memberFqn, attr = null) {
    const memberFqnValue = memberFqnStr(memberFqn);
    const memberPart = memberFqnValue ? ` for member "${memberFqnValue}"` : '';
    const typeName = 'builtin' in type ? type.builtin : ('array' in type ? 'array' : ('dict' in type ? 'dict' : type.user));
    const attrPart = attr !== null ? ` [${attr}]` : '';
    const valueStr = `${JSON.stringify(value)}`;
    const msg = `Invalid value ${valueStr.slice(0, 100)} (type "${typeof value}")${memberPart}, expected type "${typeName}"${attrPart}`;
    throw new ValidationError(msg, memberFqnValue);
}


function validateAttr(type, attr, value, memberFqn) {
    if ('eq' in attr && !(value === attr.eq)) {
        throwMemberError(type, value, memberFqn, `== ${attr.eq}`);
    }
    if ('lt' in attr && !(value < attr.lt)) {
        throwMemberError(type, value, memberFqn, `< ${attr.lt}`);
    }
    if ('lte' in attr && !(value <= attr.lte)) {
        throwMemberError(type, value, memberFqn, `<= ${attr.lte}`);
    }
    if ('gt' in attr && !(value > attr.gt)) {
        throwMemberError(type, value, memberFqn, `> ${attr.gt}`);
    }
    if ('gte' in attr && !(value >= attr.gte)) {
        throwMemberError(type, value, memberFqn, `>= ${attr.gte}`);
    }
    if ('lenEq' in attr || 'lenLT' in attr || 'lenLTE' in attr || 'lenGT' in attr || 'lenGTE' in attr) {
        const length = Array.isArray(value) || typeof value === 'string' ? value.length
            : (value instanceof Map ? value.size : (typeof value === 'object' ? Object.keys(value).length : null));
        if ('lenEq' in attr && !(length === attr.lenEq)) {
            throwMemberError(type, value, memberFqn, `len == ${attr.lenEq}`);
        }
        if ('lenLT' in attr && !(length < attr.lenLT)) {
            throwMemberError(type, value, memberFqn, `len < ${attr.lenLT}`);
        }
        if ('lenLTE' in attr && !(length <= attr.lenLTE)) {
            throwMemberError(type, value, memberFqn, `len <= ${attr.lenLTE}`);
        }
        if ('lenGT' in attr && !(length > attr.lenGT)) {
            throwMemberError(type, value, memberFqn, `len > ${attr.lenGT}`);
        }
        if ('lenGTE' in attr && !(length >= attr.lenGTE)) {
            throwMemberError(type, value, memberFqn, `len >= ${attr.lenGTE}`);
        }
    }
}


/**
 * Get the struct's members (inherited members first)
 *
 * @param {Object} types - The [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @param {Object} struct - The [struct model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Struct'}
 * @returns {Array<Object>} The array of
 *     [struct member models]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='StructMember'}
 */
export function getStructMembers(types, struct) {
    // No base structs?
    if (!('bases' in struct)) {
        return 'members' in struct ? struct.members : [];
    }

    // Get base struct members
    const members = [];
    for (const base of struct.bases) {
        let baseUserType = getUserType(types, base);
        while ('typedef' in baseUserType) {
            baseUserType = getUserType(types, baseUserType.typedef.type.user);
        }
        members.push(...getStructMembers(types, baseUserType.struct));
    }

    // Add struct members
    if ('members' in struct) {
        members.push(...struct.members);
    }

    return members;
}


/**
 * Get the enum's values (inherited values first)
 *
 * @param {Object} types - The [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @param {Object} enum_ - The [enum model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Enum'}
 * @returns {Array<Object>} The array of
 *     [enum value models]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='EnumValue'}
 */
export function getEnumValues(types, enum_) {
    // No base enums?
    if (!('bases' in enum_)) {
        return 'values' in enum_ ? enum_.values : [];
    }

    // Get base enum values
    const values = [];
    for (const base of enum_.bases) {
        let baseUserType = getUserType(types, base);
        while ('typedef' in baseUserType) {
            baseUserType = getUserType(types, baseUserType.typedef.type.user);
        }
        values.push(...getEnumValues(types, baseUserType.enum));
    }

    // Add enum values
    if ('values' in enum_) {
        values.push(...enum_.values);
    }

    return values;
}


/**
 * Validate a type model's types object
 *
 * @param {Object} types - The [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @returns {Object} The validated [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @throws [ValidationError]{@link module:lib/schema.ValidationError}
 */
export function validateTypeModel(types) {
    // Validate with the type model
    const validatedTypes = validateType(typeModel, 'Types', types);

    // Do additional type model validation
    const errors = validateTypeModelErrors(validatedTypes);
    if (errors.length) {
        // Sort by (typeName, memberName, message); null memberName as ''
        errors.sort((errorA, errorB) => {
            let result = 0;
            for (let ixPart = 0; ixPart < 3; ixPart++) {
                const partA = errorA[ixPart] ?? '';
                const partB = errorB[ixPart] ?? '';
                if (partA < partB) {
                    result = -1;
                    break;
                }
                if (partA > partB) {
                    result = 1;
                    break;
                }
            }
            return result;
        });
        throw new ValidationError(errors.map(([,, message]) => message).join('\n'));
    }

    return validatedTypes;
}
