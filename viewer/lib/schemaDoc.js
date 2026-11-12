// schemaDoc.js - Schema Markdown type model documentation, as Markdown text - structs, enums, and typedefs (a port of the
// BareScript library's "schemaDocMarkdown" function)

import {getEnumValues, getReferencedTypes, getStructMembers} from 'schema-markdown/lib/schema.js';
import {headerId} from './format.js';
import {markdownEscape, markdownTable} from './markdown.js';


// Create a user type's documentation Markdown text lines - the type's documentation, then its referenced types'
export function schemaDocMarkdown(types, typeName) {
    const lines = userTypeMarkdown(types, typeName, '#');
    const referencedNames = Object.keys(getReferencedTypes(types, typeName)).filter((name) => name !== typeName).sort();
    if (referencedNames.length > 0) {
        lines.push('', '---', '', '## Referenced Types');
        for (const referencedName of referencedNames) {
            lines.push('', ...userTypeMarkdown(types, referencedName, '###'));
        }
    }
    return lines;
}


// Create a user type's documentation Markdown text lines
function userTypeMarkdown(types, typeName, headerPrefix) {
    const userType = types[typeName];
    const lines = [`${headerPrefix} ${typeTitle(userType)}`];
    const table = (fields, rows) => {
        lines.push('', ...markdownTable(fields.map((field) => [field, 'left']), rows));
    };

    // Typedef?
    if ('typedef' in userType) {
        const {typedef} = userType;
        docLines(lines, typedef);
        const attr = attrText(typedef);
        table(attr !== null ? ['Type', 'Attributes'] : ['Type'], [[typeText(types, typedef.type), ...(attr !== null ? [attr] : [])]]);
        return lines;
    }

    // Enum?
    if ('enum' in userType) {
        const enum_ = userType.enum;
        basesLines(lines, types, enum_);
        docLines(lines, enum_);
        const values = getEnumValues(types, enum_);
        if (values.length === 0) {
            lines.push('', 'The enum is empty.');
        } else {
            const hasDoc = values.some((value) => 'doc' in value);
            table(hasDoc ? ['Value', 'Description'] : ['Value'], values.map((value) => (
                [value.name, ...(hasDoc ? [(value.doc ?? []).join('\n')] : [])]
            )));
        }
        return lines;
    }

    // Struct
    const {struct} = userType;
    basesLines(lines, types, struct);
    docLines(lines, struct);
    const members = getStructMembers(types, struct);
    if (members.length === 0) {
        lines.push('', 'The struct is empty.');
    } else {
        const hasAttr = members.some((member) => attrText(member) !== null);
        const hasDoc = members.some((member) => 'doc' in member);
        table(['Name', 'Type', ...(hasAttr ? ['Attributes'] : []), ...(hasDoc ? ['Description'] : [])], members.map((member) => [
            member.name,
            typeText(types, member.type),
            ...(hasAttr ? [attrText(member) ?? ''] : []),
            ...(hasDoc ? [(member.doc ?? []).join('\n')] : [])
        ]));
    }
    return lines;
}


// Add a type's base types line
function basesLines(lines, types, typeModel) {
    if ('bases' in typeModel) {
        lines.push('', `Bases: ${typeModel.bases.map((base) => typeLink(types, base)).join(', ')}`);
    }
}


// Add a type's documentation lines
function docLines(lines, typeModel) {
    if ('doc' in typeModel) {
        lines.push('', ...typeModel.doc);
    }
}


// Get a user type's title
function typeTitle(userType) {
    if ('struct' in userType) {
        return `${userType.struct.union ? 'union' : 'struct'} ${userType.struct.name}`;
    } else if ('enum' in userType) {
        return `enum ${userType.enum.name}`;
    }
    return `typedef ${userType.typedef.name}`;
}


// Create a user type's documentation link
function typeLink(types, typeName) {
    return `[${markdownEscape(typeName)}](#${headerId(typeTitle(types[typeName]))})`;
}


// Create a type's Markdown text - user types link to their documentation
function typeText(types, type) {
    if ('array' in type) {
        return `${typeText(types, type.array.type)} []`;
    } else if ('dict' in type) {
        const {dict} = type;
        const valueText = `${typeText(types, dict.type)} {}`;
        return 'keyType' in dict && !('builtin' in dict.keyType) ? `${typeText(types, dict.keyType)} : ${valueText}` : valueText;
    } else if ('user' in type) {
        return typeLink(types, type.user);
    }
    return type.builtin;
}


// The attribute comparison operators, in display order - the "len" attributes compare the noun's length
const attrOps = [
    ['gt', '>'], ['gte', '>='], ['lt', '<'], ['lte', '<='], ['eq', '=='],
    ['lenGT', '>'], ['lenGTE', '>='], ['lenLT', '<'], ['lenLTE', '<='], ['lenEq', '==']
];


// Create a member's (or typedef's) attributes Markdown text - null if it has none
function attrText(member) {
    const {type} = member;
    const parts = [];
    let noun = 'value';
    if ('array' in type) {
        noun = 'array';
    } else if ('dict' in type) {
        noun = 'dict';
    }
    attrParts(parts, noun, member.attr ?? null, member.optional ?? false);

    // Array value and dict key and value attributes
    if ('array' in type) {
        attrParts(parts, 'value', type.array.attr ?? null, false);
    } else if ('dict' in type) {
        attrParts(parts, 'key', type.dict.keyAttr ?? null, false);
        attrParts(parts, 'value', type.dict.attr ?? null, false);
    }
    return parts.length > 0 ? parts.join('<br>') : null;
}


// Add an attribute's parts
function attrParts(parts, noun, attr, optional) {
    if (optional) {
        parts.push('optional');
    }
    if (attr !== null) {
        if ('nullable' in attr) {
            parts.push('nullable');
        }
        for (const [attrName, op] of attrOps) {
            if (attrName in attr) {
                parts.push(`${attrName.startsWith('len') ? `len(${noun})` : noun} ${op} ${attr[attrName]}`);
            }
        }
    }
}
