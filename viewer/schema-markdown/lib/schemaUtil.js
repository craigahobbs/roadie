// Licensed under the MIT License
// https://github.com/craigahobbs/schema-markdown-js/blob/main/LICENSE


/**
 * Helper function to validate user type dictionary
 *
 * @param {Object} types - The map of user type name to user type model
 * @returns {Array<Array>} The list of type name, member name, and error message tuples
 *
 * @ignore
 */
export function validateTypeModelErrors(types) {
    const errors = [];

    // Check each user type
    for (const [typeName, userType] of Object.entries(types)) {
        // Struct?
        if ('struct' in userType) {
            const {struct} = userType;

            // Inconsistent type name?
            if (typeName !== struct.name) {
                errors.push([typeName, null, `Inconsistent type name "${struct.name}" for "${typeName}"`]);
            }

            // Check base types
            if ('bases' in struct) {
                const isUnion = 'union' in struct ? struct.union : false;
                for (const baseName of struct.bases) {
                    let invalidBase = true;
                    const baseUserType = getEffectiveUserType(types, baseName);
                    if (baseUserType !== null && 'struct' in baseUserType) {
                        if (isUnion === ('union' in baseUserType.struct ? baseUserType.struct.union : false)) {
                            invalidBase = false;
                        }
                    }
                    if (invalidBase) {
                        errors.push([typeName, null, `Invalid struct base type "${baseName}"`]);
                    }
                }
            }

            // Iterate the members
            try {
                const members = new Set();
                for (const member of getStructMembers(types, struct)) {
                    const memberName = member.name;

                    // Duplicate member?
                    if (!members.has(memberName)) {
                        members.add(memberName);
                    } else {
                        errors.push([typeName, memberName, `Redefinition of "${typeName}" member "${memberName}"`]);
                    }

                    // Check member type and attributes
                    validateTypeModelType(errors, types, member.type, 'attr' in member ? member.attr : null, struct.name, member.name);
                }
            } catch {
                errors.push([typeName, null, `Circular base type detected for type "${typeName}"`]);
            }

        // Enum?
        } else if ('enum' in userType) {
            const enum_ = userType.enum;

            // Inconsistent type name?
            if (typeName !== enum_.name) {
                errors.push([typeName, null, `Inconsistent type name "${enum_.name}" for "${typeName}"`]);
            }

            // Check base types
            if ('bases' in enum_) {
                for (const baseName of enum_.bases) {
                    const baseUserType = getEffectiveUserType(types, baseName);
                    if (baseUserType === null || !('enum' in baseUserType)) {
                        errors.push([typeName, null, `Invalid enum base type "${baseName}"`]);
                    }
                }
            }

            // Get the enumeration values
            try {
                const values = new Set();
                for (const value of getEnumValues(types, enum_)) {
                    const valueName = value.name;

                    // Duplicate value?
                    if (!values.has(valueName)) {
                        values.add(valueName);
                    } else {
                        errors.push([typeName, valueName, `Redefinition of "${typeName}" value "${valueName}"`]);
                    }
                }
            } catch {
                errors.push([typeName, null, `Circular base type detected for type "${typeName}"`]);
            }

        // Typedef?
        } else if ('typedef' in userType) {
            const {typedef} = userType;

            // Inconsistent type name?
            if (typeName !== typedef.name) {
                errors.push([typeName, null, `Inconsistent type name "${typedef.name}" for "${typeName}"`]);
            }

            // Circular typedef?
            const visited = new Set([typeName]);
            let typedefType = typedef.type;
            while ('user' in typedefType) {
                const typedefUserName = typedefType.user;
                const typedefUserType = Object.hasOwn(types, typedefUserName) ? types[typedefUserName] : null;
                if (typedefUserType === null || !('typedef' in typedefUserType)) {
                    break;
                }
                if (visited.has(typedefUserName)) {
                    errors.push([typeName, null, `Circular typedef detected for type "${typeName}"`]);
                    break;
                }
                visited.add(typedefUserName);
                typedefType = typedefUserType.typedef.type;
            }

            // Check the type and its attributes
            validateTypeModelType(errors, types, typedef.type, 'attr' in typedef ? typedef.attr : null, typeName, null);

        // Action?
        } else if ('action' in userType) {
            const {action} = userType;

            // Inconsistent type name?
            if (typeName !== action.name) {
                errors.push([typeName, null, `Inconsistent type name "${action.name}" for "${typeName}"`]);
            }

            // Check action section types
            for (const section of ['path', 'query', 'input', 'output', 'errors']) {
                if (section in action) {
                    const sectionTypeName = action[section];

                    // Check the section type
                    validateTypeModelType(errors, types, {'user': sectionTypeName}, null, typeName, null);
                }
            }

            // Compute effective input member counts
            const memberSections = new Map();
            for (const section of ['path', 'query', 'input']) {
                if (section in action) {
                    const sectionTypeName = action[section];
                    if (Object.hasOwn(types, sectionTypeName)) {
                        const sectionUserType = getEffectiveUserType(types, sectionTypeName);
                        if (sectionUserType !== null && 'struct' in sectionUserType) {
                            const sectionStruct = sectionUserType.struct;

                            // Get the section struct's members and count member occurrences
                            try {
                                for (const member of getStructMembers(types, sectionStruct)) {
                                    const memberName = member.name;
                                    if (!memberSections.has(memberName)) {
                                        memberSections.set(memberName, []);
                                    }
                                    memberSections.get(memberName).push(sectionStruct.name);
                                }
                            } catch {
                                // Do nothing
                            }
                        }
                    }
                }
            }

            // Check for duplicate input members
            for (const [memberName, memberSectionNames] of memberSections.entries()) {
                if (memberSectionNames.length > 1) {
                    for (const sectionType of memberSectionNames.sort()) {
                        errors.push([sectionType, memberName, `Redefinition of "${sectionType}" member "${memberName}"`]);
                    }
                }
            }
        }
    }

    return errors;
}


function getEffectiveType(types, type, visited = new Set()) {
    if ('user' in type && Object.hasOwn(types, type.user) && !visited.has(type.user)) {
        const userType = types[type.user];
        if ('typedef' in userType) {
            visited.add(type.user);
            return getEffectiveType(types, userType.typedef.type, visited);
        }
    }
    return type;
}


function getEffectiveUserType(types, userTypeName) {
    const userType = Object.hasOwn(types, userTypeName) ? types[userTypeName] : null;
    if (userType !== null && 'typedef' in userType) {
        const typeEffective = getEffectiveType(types, userType.typedef.type);
        if (!('user' in typeEffective)) {
            return null;
        }
        return Object.hasOwn(types, typeEffective.user) ? types[typeEffective.user] : null;
    }
    return userType;
}


function getStructMembers(types, struct, visited = new Set()) {
    return getTypeItems(types, struct, visited, 'struct', 'members');
}


function getEnumValues(types, enum_, visited = new Set()) {
    return getTypeItems(types, enum_, visited, 'enum', 'values');
}


function getTypeItems(types, type, visited, defName, memberName) {
    const items = [];
    if ('bases' in type) {
        for (const base of type.bases) {
            const userType = getEffectiveUserType(types, base);
            if (userType !== null && defName in userType) {
                const userTypeName = userType[defName].name;
                if (!visited.has(userTypeName)) {
                    visited.add(userTypeName);
                    items.push(...getTypeItems(types, userType[defName], visited, defName, memberName));
                } else {
                    throw new TypeError();
                }
            }
        }
    }
    if (memberName in type) {
        items.push(...type[memberName]);
    }
    return items;
}


// Map of attribute struct member name to attribute description
const attrToText = {
    'eq': '==',
    'lt': '<',
    'lte': '<=',
    'gt': '>',
    'gte': '>=',
    'lenEq': 'len ==',
    'lenLT': 'len <',
    'lenLTE': 'len <=',
    'lenGT': 'len >',
    'lenGTE': 'len >='
};


// Map of type name to valid attribute set
const typeToAllowedAttr = {
    'float': ['eq', 'lt', 'lte', 'gt', 'gte'],
    'int': ['eq', 'lt', 'lte', 'gt', 'gte'],
    'string': ['lenEq', 'lenLT', 'lenLTE', 'lenGT', 'lenGTE'],
    'array': ['lenEq', 'lenLT', 'lenLTE', 'lenGT', 'lenGTE'],
    'dict': ['lenEq', 'lenLT', 'lenLTE', 'lenGT', 'lenGTE']
};


function validateTypeModelType(errors, types, type, attr, typeName, memberName) {
    // Helper function to push an error tuple
    const error = (message) => {
        if (memberName !== null) {
            errors.push([typeName, memberName, `${message} from "${typeName}" member "${memberName}"`]);
        } else {
            errors.push([typeName, null, `${message} from "${typeName}"`]);
        }
    };

    // Array?
    if ('array' in type) {
        const {array} = type;

        // Check the type and its attributes
        const arrayType = getEffectiveType(types, array.type);
        validateTypeModelType(errors, types, arrayType, 'attr' in array ? array.attr : null, typeName, memberName);

    // Dict?
    } else if ('dict' in type) {
        const {dict} = type;

        // Check the type and its attributes
        const dictType = getEffectiveType(types, dict.type);
        validateTypeModelType(errors, types, dictType, 'attr' in dict ? dict.attr : null, typeName, memberName);

        // Check the dict key type and its attributes
        if ('keyType' in dict) {
            const dictKeyType = getEffectiveType(types, dict.keyType);
            validateTypeModelType(errors, types, dictKeyType, 'keyAttr' in dict ? dict.keyAttr : null, typeName, memberName);

            // Valid dict key type (string or enum)
            if (!('builtin' in dictKeyType && dictKeyType.builtin === 'string') &&
                !('user' in dictKeyType && Object.hasOwn(types, dictKeyType.user) && 'enum' in types[dictKeyType.user])) {
                error('Invalid dictionary key type');
            }
        }

    // User type?
    } else if ('user' in type) {
        const userTypeName = type.user;

        // Unknown user type?
        if (!Object.hasOwn(types, userTypeName)) {
            error(`Unknown type "${userTypeName}"`);
        } else {
            const userType = types[userTypeName];

            // Action type references not allowed
            if ('action' in userType) {
                error(`Invalid reference to action "${userTypeName}"`);
            }
        }
    }

    // Any not-allowed attributes?
    if (attr !== null) {
        const typeEffective = getEffectiveType(types, type);
        const [typeKey] = Object.keys(typeEffective);
        const typeAttrKey = typeKey === 'builtin' ? typeEffective[typeKey] : typeKey;
        const allowedAttr = Object.hasOwn(typeToAllowedAttr, typeAttrKey) ? typeToAllowedAttr[typeAttrKey] : null;
        const disallowedAttr = Object.fromEntries(Object.keys(attr).map((attrKey) => [attrKey, null]));
        delete disallowedAttr.nullable;
        if (allowedAttr !== null) {
            for (const attrKey of allowedAttr) {
                delete disallowedAttr[attrKey];
            }
        }
        if (Object.keys(disallowedAttr).length) {
            for (const attrKey of Object.keys(disallowedAttr)) {
                const attrValue = `${attr[attrKey]}`;
                const attrText = `${attrToText[attrKey]} ${attrValue}`;
                error(`Invalid attribute "${attrText}"`);
            }
        }
    }
}
