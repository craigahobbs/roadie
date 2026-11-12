// schema.js - a Schema Markdown type model parser and validator, for the subset the road plan model uses
// (structs, enums, and typedefs with optional members, arrays, and value and length attributes)


// Parse Schema Markdown text lines into a type model - an object of type name to user type
export function schemaParse(lines) {
    const types = {};
    let doc = [];
    let current = null;
    for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (line === '') {
            continue;
        }

        // Documentation comment
        if (line.startsWith('#')) {
            doc.push(line.slice(1).trim());
            continue;
        }

        // Type definition
        const mType = line.match(/^(struct|enum)\s+(\w+)$/);
        if (mType !== null) {
            const [, kind, name] = mType;
            current = kind === 'struct' ? {name, doc, 'members': []} : {name, doc, 'values': []};
            types[name] = {[kind]: current};
            doc = [];
            continue;
        }
        const mTypedef = line.match(/^typedef\s+(.+?)\s+(\w+)$/);
        if (mTypedef !== null) {
            const [, typeText, name] = mTypedef;
            const {type, attr} = parseTypeText(typeText);
            types[name] = {'typedef': {name, doc, type, attr}};
            current = null;
            doc = [];
            continue;
        }

        // Struct member or enum value
        if ('members' in current) {
            const mMember = line.match(/^(optional\s+)?(.+?)\s+(\w+)$/);
            const {type, attr} = parseTypeText(mMember[2]);
            const member = {'name': mMember[3], doc, type, 'optional': mMember[1] !== undefined};
            if (attr !== null) {
                member.attr = attr;
            }
            current.members.push(member);
        } else {
            current.values.push({'name': line, doc});
        }
        doc = [];
    }
    return types;
}


// Parse a member type, e.g. "string(len > 0)", "float(>= 0)", "Point[len > 1]", or "string[]"
function parseTypeText(text) {
    const mArray = text.match(/^(.+?)\[([^\]]*)\]$/);
    if (mArray !== null) {
        const element = parseTypeText(mArray[1]);
        const array = {'type': element.type};
        if (element.attr !== null) {
            array.attr = element.attr;
        }
        return {'type': {array}, 'attr': parseAttrs(mArray[2])};
    }
    const mAttr = text.match(/^(\w+)\((.*)\)$/);
    const name = mAttr !== null ? mAttr[1] : text;
    const type = builtinTypes.has(name) ? {'builtin': name} : {'user': name};
    return {type, 'attr': mAttr !== null ? parseAttrs(mAttr[2]) : null};
}

const builtinTypes = new Set(['bool', 'date', 'datetime', 'float', 'int', 'object', 'string', 'uuid']);


// Parse type attributes, e.g. "len > 0" or ">= 0"
function parseAttrs(text) {
    if (text.trim() === '') {
        return null;
    }
    const attr = {};
    for (const part of text.split(',')) {
        const [, len, op, value] = part.trim().match(/^(len\s*)?(==|<=|<|>=|>)\s*(-?[\d.]+)$/);
        attr[(len !== undefined ? attrLenNames : attrNames)[op]] = parseFloat(value);
    }
    return attr;
}

const attrNames = {'==': 'eq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte'};
const attrLenNames = {'==': 'lenEq', '<': 'lenLT', '<=': 'lenLTE', '>': 'lenGT', '>=': 'lenGTE'};
export const attrOps = {
    'eq': '==', 'lt': '<', 'lte': '<=', 'gt': '>', 'gte': '>=',
    'lenEq': '==', 'lenLT': '<', 'lenLTE': '<=', 'lenGT': '>', 'lenGTE': '>='
};


// Validate a value against a type - returns an object with "result" (the validated copy) on success, or "error"
export function schemaValidate(types, typeName, value) {
    const error = {};
    const result = validateType(types, {'user': typeName}, value, null, error);
    return 'message' in error ? {'error': error.message} : {result};
}


// Get a value's BareScript type name
function valueType(value) {
    if (value === null) {
        return 'null';
    } else if (Array.isArray(value)) {
        return 'array';
    }
    return typeof value;
}


function validateType(types, type, value, memberFqn, error) {
    if ('builtin' in type) {
        const {builtin} = type;
        if (builtin === 'string') {
            if (typeof value !== 'string') {
                return memberError(error, type, value, memberFqn, null);
            }
        } else if (builtin === 'float' || builtin === 'int') {
            let number = value;
            if (typeof value === 'string') {
                number = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/.test(value) ? parseFloat(value) : null;
                if (number === null || !isFinite(number)) {
                    return memberError(error, type, value, memberFqn, null);
                }
            } else if (typeof value !== 'number') {
                return memberError(error, type, value, memberFqn, null);
            }
            if (builtin === 'int' && Math.floor(number) !== number) {
                return memberError(error, type, value, memberFqn, null);
            }
            return number;
        } else if (builtin === 'bool') {
            if (value === 'true' || value === 'false') {
                return value === 'true';
            } else if (typeof value !== 'boolean') {
                return memberError(error, type, value, memberFqn, null);
            }
        }
        return value;
    }

    if ('user' in type) {
        const userType = types[type.user];
        if ('typedef' in userType) {
            const {typedef} = userType;
            const valueNew = validateType(types, typedef.type, value, memberFqn, error);
            if ('message' in error) {
                return null;
            }
            if (typedef.attr !== null) {
                validateAttr(type, typedef.attr, valueNew, memberFqn, error);
            }
            return valueNew;
        } else if ('enum' in userType) {
            if (!userType.enum.values.some((enumValue) => enumValue.name === value)) {
                return memberError(error, type, value, memberFqn, null);
            }
            return value;
        }

        // Struct
        const {struct} = userType;
        if (valueType(value) !== 'object') {
            return memberError(error, {'user': struct.name}, value, memberFqn, null);
        }
        const valueCopy = {};
        let memberCount = 0;
        for (const member of struct.members) {
            const memberName = member.name;
            if (!Object.hasOwn(value, memberName)) {
                if (!member.optional) {
                    error.message = `Required member "${fqnString([memberFqn, memberName])}" missing`;
                    return null;
                }
            } else {
                const memberFqnMember = [memberFqn, memberName];
                const memberValue = validateType(types, member.type, value[memberName], memberFqnMember, error);
                if ('message' in error) {
                    return null;
                }
                if ('attr' in member) {
                    validateAttr(member.type, member.attr, memberValue, memberFqnMember, error);
                    if ('message' in error) {
                        return null;
                    }
                }
                valueCopy[memberName] = memberValue;
                memberCount += 1;
            }
        }
        if (memberCount !== Object.keys(value).length) {
            for (const valueKey of Object.keys(value)) {
                if (!struct.members.some((member) => member.name === valueKey)) {
                    error.message = `Unknown member "${truncate(fqnString([memberFqn, valueKey]))}"`;
                    return null;
                }
            }
        }
        return valueCopy;
    }

    // Array
    const {array} = type;
    if (!Array.isArray(value)) {
        return memberError(error, type, value, memberFqn, null);
    }
    const valueCopy = [];
    for (let ix = 0; ix < value.length; ix++) {
        const memberFqnValue = [memberFqn, ix];
        const arrayValue = validateType(types, array.type, value[ix], memberFqnValue, error);
        if ('message' in error) {
            return null;
        }
        if ('attr' in array) {
            validateAttr(array.type, array.attr, arrayValue, memberFqnValue, error);
            if ('message' in error) {
                return null;
            }
        }
        valueCopy.push(arrayValue);
    }
    return valueCopy;
}


function fqnString(memberFqn) {
    const parts = [];
    let fqnPart = memberFqn;
    while (Array.isArray(fqnPart)) {
        parts.push(`${fqnPart[1]}`);
        [fqnPart] = fqnPart;
    }
    if (fqnPart !== null) {
        parts.push(`${fqnPart}`);
    }
    return parts.reverse().join('.');
}


function truncate(text) {
    return text.length > 1000 ? `${text.slice(0, 1000)} ...` : text;
}


function memberError(error, type, value, memberFqn, attr) {
    const memberFqnValue = memberFqn !== null ? fqnString(memberFqn) : null;
    const memberPart = memberFqnValue ? ` for member "${memberFqnValue}"` : '';
    let typeName;
    if ('builtin' in type) {
        typeName = type.builtin;
    } else if ('array' in type) {
        typeName = 'array';
    } else {
        typeName = type.user;
    }
    const attrPart = attr !== null ? ` [${attr}]` : '';
    error.message = `Invalid value ${truncate(JSON.stringify(value) ?? 'null')} (type "${valueType(value)}")${memberPart}, ` +
        `expected type "${typeName}"${attrPart}`;
    return null;
}


function validateAttr(type, attr, value, memberFqn, error) {
    for (const [name, op] of Object.entries(attrOps)) {
        if (name in attr) {
            const isLen = name.startsWith('len');
            let operand = value;
            if (isLen) {
                operand = typeof value === 'string' || Array.isArray(value) ? value.length : Object.keys(value).length;
            }
            const attrValue = attr[name];
            const valid = (op === '==' && operand === attrValue) || (op === '<' && operand < attrValue) ||
                (op === '<=' && operand <= attrValue) || (op === '>' && operand > attrValue) || (op === '>=' && operand >= attrValue);
            if (!valid) {
                return memberError(error, type, value, memberFqn, `${isLen ? 'len ' : ''}${op} ${attrValue}`);
            }
        }
    }
    return null;
}
