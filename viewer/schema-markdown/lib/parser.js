// Licensed under the MIT License
// https://github.com/craigahobbs/schema-markdown-js/blob/main/LICENSE

/** @module lib/parser */

import {validateTypeModelErrors} from './schemaUtil.js';


// Built-in types
const builtinTypes = new Set(['any', 'bool', 'date', 'datetime', 'float', 'int', 'string', 'uuid']);
const builtinDeprecated = {'object': 'any'};


// Schema Markdown regex
const rPartId = '(?:[A-Za-z]\\w*)';
const rPartAttrGroup =
      '(?:(?<nullable>nullable)' +
      '|(?<op><=|<|>|>=|==)\\s*(?<opnum>-?\\d+(?:\\.\\d+)?)' +
      '|(?<ltype>len)\\s*(?<lop><=|<|>|>=|==)\\s*(?<lopnum>\\d+))';
const rPartAttr = rPartAttrGroup.replace(/\(\?<[^>]+>/g, '(?:');
const rPartAttrs = `(?:${rPartAttr}(?:\\s*,\\s*${rPartAttr})*)`;
const rAttrGroup = new RegExp(rPartAttrGroup);
const rFindAttrs = new RegExp(`${rPartAttr}(?:\\s*,\\s*|\\s*$)`, 'g');
const rLineCont = /\\\s*$/;
const rComment = /^\s*(?:#-.*|#(?<doc>.*))?$/;
const rGroup = /^group(?:\s+"(?<group>.+?)")?\s*$/;
const rAction = new RegExp(`^action\\s+(?<id>${rPartId})\\s*$`);
const rPartBaseIds = `(?:\\s*\\(\\s*(?<baseIds>${rPartId}(?:\\s*,\\s*${rPartId})*)\\s*\\)\\s*)`;
const rBaseIdsSplit = /\s*,\s*/;
const rDefinition = new RegExp(`^(?<type>struct|union|enum)\\s+(?<id>${rPartId})${rPartBaseIds}?\\s*$`);
const rSection = new RegExp(`^\\s+(?<type>path|query|input|output|errors)${rPartBaseIds}?\\s*$`);
const rSectionPlain = /^\s+(?<type>urls)\s*$/;
const rPartTypedef =
      `(?<type>${rPartId})` +
      `(?:\\s*\\(\\s*(?<attrs>${rPartAttrs})\\s*\\))?` +
      '(?:' +
      `(?:\\s*\\[\\s*(?<array>${rPartAttrs}?)\\s*\\])?` +
      '|' +
      '(?:' +
      `\\s*:\\s*(?<dictValueType>${rPartId})` +
      `(?:\\s*\\(\\s*(?<dictValueAttrs>${rPartAttrs})\\s*\\))?` +
      ')?' +
      `(?:\\s*\\{\\s*(?<dict>${rPartAttrs}?)\\s*\\})?` +
      ')' +
      `\\s+(?<id>${rPartId})`;
const rTypedef = new RegExp(`^typedef\\s+${rPartTypedef}\\s*$`);
const rMember = new RegExp(`^\\s+(?<optional>optional\\s+)?${rPartTypedef}\\s*$`);
const rValue = new RegExp(`^\\s+(?<id>${rPartId})\\s*$`);
const rValueQuoted = /^\s+"(?<id>.*?)"\s*$/;
const rURL = /^\s+(?<method>[A-Za-z]+|\*)(?:\s+(?<path>\/\S*))?/;
const rLineSplit = /\r?\n/;
const rIndent = /^\s/;


/**
 * Parse Schema Markdown from a string or an iterator of strings
 *
 * @param {string|string[]} text - The Schema Markdown text
 * @param {Object} [options = {}] - The options object
 * @param {Object} [options.types={}] - The
 *     [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @param {string} [options.filename=''] - The name of file being parsed (for error messages)
 * @param {boolean} [options.validate=true] - If true, validate after parsing
 * @returns {Object} The [type model]{@link https://craigahobbs.github.io/bare-script/model/#var.vURL=''&var.vName='Types'}
 * @throws [SchemaMarkdownParserError]{@link module:lib/parser.SchemaMarkdownParserError}
 */
export function parseSchemaMarkdown(text, {types = {}, filename = '', validate = true} = {}) {
    // Current parser state
    const errorMap = {};
    const filepos = {};
    let action = null;
    let urls = null;
    let userType = null;
    let doc = [];
    let docGroup = null;
    let linenum = 0;

    // Helper function to add an error message
    const addError = (msg, errorFilename, errorLinenum) => {
        const errorMsg = `${errorFilename}:${errorLinenum}: error: ${msg}`;
        errorMap[errorMsg] = [errorFilename, errorLinenum, errorMsg];
    };

    // Helper function to get documentation strings
    const getDoc = () => {
        let result = null;
        if (doc.length) {
            result = doc;
            doc = [];
        }
        return result;
    };

    // Line-split all script text
    const lines = [];
    if (typeof text === 'string') {
        lines.push(...text.split(rLineSplit));
    } else {
        for (const textPart of text) {
            if (typeof textPart !== 'string') {
                throw new TypeError(`Invalid Schema Markdown text ${JSON.stringify(textPart)}`.slice(0, 100));
            }
            lines.push(...textPart.split(rLineSplit));
        }
    }
    lines.push('');

    // Process each line
    const lineContinuation = [];
    for (const linePart of lines) {
        linenum += 1;

        // Line continuation?
        const linePartNoContinuation = linePart.includes('\\') ? linePart.replace(rLineCont, '') : linePart;
        let line;
        if (linePartNoContinuation === linePart && !lineContinuation.length) {
            line = linePart;
        } else {
            lineContinuation.push(linePartNoContinuation);
            if (linePartNoContinuation !== linePart) {
                continue;
            }
            line = lineContinuation.join('');
            lineContinuation.length = 0;
        }

        // Match syntax - each regex is guarded by a cheap string test that only skips it when it cannot match
        const lineTrimmed = line.trim();
        let matchName = 'comment';
        let match = (lineTrimmed === '' || lineTrimmed.startsWith('#')) ? line.match(rComment) : null;

        // Not a comment or blank line? Try the remaining syntax
        if (match === null) {
            const lineIndented = rIndent.test(line);
            matchName = 'group';
            match = line.startsWith('group') ? line.match(rGroup) : null;
            if (match === null) {
                matchName = 'action';
                match = line.startsWith('action') ? line.match(rAction) : null;
            }
            if (match === null) {
                matchName = 'definition';
                match = (line.startsWith('struct') || line.startsWith('union') || line.startsWith('enum')) ? line.match(rDefinition) : null;
            }
            if (match === null && action !== null && lineIndented) {
                matchName = 'section';
                match = line.match(rSection);
            }
            if (match === null && action !== null && lineIndented) {
                matchName = 'sectionPlain';
                match = line.match(rSectionPlain);
            }
            if (match === null && userType !== null && 'enum' in userType && lineIndented) {
                matchName = 'value';
                match = line.match(rValue);
                if (match === null) {
                    match = line.match(rValueQuoted);
                }
            }
            if (match === null && userType !== null && 'struct' in userType && lineIndented) {
                matchName = 'member';
                match = line.match(rMember);
            }
            if (match === null && urls !== null && lineIndented) {
                matchName = 'urls';
                match = line.match(rURL);
            }
            if (match === null) {
                matchName = 'typedef';
                match = line.startsWith('typedef') ? line.match(rTypedef) : null;
            }
            if (match === null) {
                matchName = null;
            }
        }

        // Comment?
        if (matchName === 'comment') {
            const docString = match.groups.doc;
            if (typeof docString !== 'undefined') {
                doc.push(!docString.startsWith(' ') ? docString : docString.slice(1));
            }

        // Struct member?
        } else if (matchName === 'member') {
            const optional = typeof match.groups.optional !== 'undefined';
            const memberName = match.groups.id;

            // Add the member
            const {struct} = userType;
            if (!('members' in struct)) {
                struct.members = [];
            }
            const [memberType, memberAttr] = parseTypedef(match);
            const memberDoc = getDoc();
            const member = {
                'name': memberName,
                'type': memberType
            };
            struct.members.push(member);
            if (memberAttr !== null) {
                member.attr = memberAttr;
            }
            if (memberDoc !== null) {
                member.doc = memberDoc;
            }
            if (optional) {
                member.optional = true;
            }

            // Record the definition's line number
            filepos[`${struct.name}.${memberName}`] = linenum;

        // Definition?
        } else if (matchName === 'definition') {
            const definitionString = match.groups.type;
            const definitionId = match.groups.id;
            const definitionBaseIds = match.groups.baseIds;

            // Type already defined?
            if (builtinTypes.has(definitionId) || Object.hasOwn(builtinDeprecated, definitionId) || Object.hasOwn(types, definitionId)) {
                addError(`Redefinition of type '${definitionId}'`, filename, linenum);
            }

            // Clear parser state
            action = null;
            urls = null;
            const definitionDoc = getDoc();

            // Struct definition
            if (definitionString === 'struct' || definitionString === 'union') {
                // Create the new struct type
                const struct = {'name': definitionId};
                userType = {'struct': struct};
                types[definitionId] = userType;
                if (definitionDoc !== null) {
                    struct.doc = definitionDoc;
                }
                if (docGroup !== null) {
                    struct.docGroup = docGroup;
                }
                if (definitionString === 'union') {
                    struct.union = true;
                }
                if (typeof definitionBaseIds !== 'undefined') {
                    struct.bases = definitionBaseIds.split(rBaseIdsSplit);
                }

            // Enum definition
            } else {
                // definitionString == 'enum':
                // Create the new enum type
                const enum_ = {'name': definitionId};
                userType = {'enum': enum_};
                types[definitionId] = userType;
                if (definitionDoc !== null) {
                    enum_.doc = definitionDoc;
                }
                if (docGroup !== null) {
                    enum_.docGroup = docGroup;
                }
                if (typeof definitionBaseIds !== 'undefined') {
                    enum_.bases = definitionBaseIds.split(rBaseIdsSplit);
                }
            }

            // Record the definition's line number
            filepos[definitionId] = linenum;

        // Enum value?
        } else if (matchName === 'value') {
            const valueString = match.groups.id;

            // Add the enum value
            const enum_ = userType.enum;
            if (!('values' in enum_)) {
                enum_.values = [];
            }
            const enumValue = {'name': valueString};
            enum_.values.push(enumValue);
            const enumValueDoc = getDoc();
            if (enumValueDoc !== null) {
                enumValue.doc = enumValueDoc;
            }

            // Record the definition's line number
            filepos[`${enum_.name}.${valueString}`] = linenum;

        // Typedef?
        } else if (matchName === 'typedef') {
            const definitionId = match.groups.id;

            // Type already defined?
            if (builtinTypes.has(definitionId) || Object.hasOwn(builtinDeprecated, definitionId) || Object.hasOwn(types, definitionId)) {
                addError(`Redefinition of type '${definitionId}'`, filename, linenum);
            }

            // Clear parser state
            action = null;
            urls = null;
            userType = null;
            const typedefDoc = getDoc();

            // Create the typedef
            const [typedefType, typedefAttr] = parseTypedef(match);
            const typedef = {
                'name': definitionId,
                'type': typedefType
            };
            types[definitionId] = {'typedef': typedef};
            if (typedefAttr !== null) {
                typedef.attr = typedefAttr;
            }
            if (typedefDoc !== null) {
                typedef.doc = typedefDoc;
            }
            if (docGroup !== null) {
                typedef.docGroup = docGroup;
            }

            // Record the definition's line number
            filepos[definitionId] = linenum;

        // Documentation group?
        } else if (matchName === 'group') {
            docGroup = match.groups.group;
            if (typeof docGroup !== 'undefined') {
                docGroup = docGroup.trim();
            } else {
                docGroup = null;
            }

        // Action?
        } else if (matchName === 'action') {
            const actionId = match.groups.id;

            // Action already defined?
            if (Object.hasOwn(types, actionId)) {
                addError(`Redefinition of action '${actionId}'`, filename, linenum);
            }

            // Clear parser state
            urls = null;
            userType = null;
            const actionDoc = getDoc();

            // Create the new action
            action = {'name': actionId};
            types[actionId] = {'action': action};
            if (actionDoc !== null) {
                action.doc = actionDoc;
            }
            if (docGroup !== null) {
                action.docGroup = docGroup;
            }

        // Action section?
        } else if (matchName === 'section') {
            const sectionString = match.groups.type;
            const sectionBaseIds = match.groups.baseIds;

            // Action section redefinition?
            if (sectionString in action) {
                addError(`Redefinition of action ${sectionString}`, filename, linenum);
            }

            // Clear parser state
            urls = null;

            // Set the action section type
            const sectionTypeName = `${action.name}_${sectionString}`;
            action[sectionString] = sectionTypeName;
            if (sectionString === 'errors') {
                const enum_ = {'name': sectionTypeName};
                userType = {'enum': enum_};
                types[sectionTypeName] = userType;
                if (typeof sectionBaseIds !== 'undefined') {
                    enum_.bases = sectionBaseIds.split(rBaseIdsSplit);
                }
            } else {
                const struct = {'name': sectionTypeName};
                userType = {'struct': struct};
                types[sectionTypeName] = userType;
                if (typeof sectionBaseIds !== 'undefined') {
                    struct.bases = sectionBaseIds.split(rBaseIdsSplit);
                }
            }

            // Record the definition's line number
            filepos[sectionTypeName] = linenum;

        // Plain action section?
        } else if (matchName === 'sectionPlain') {
            const sectionString = match.groups.type;

            // Action section redefinition?
            if (sectionString in action) {
                addError(`Redefinition of action ${sectionString}`, filename, linenum);
            }

            // Clear parser state
            userType = null;

            // Update the parser state - attach urls immediately so a second empty
            // "urls" section is detected as a redefinition (even with no URL lines)
            urls = [];
            if (!(sectionString in action)) {
                action[sectionString] = urls;
            }

        // URL?
        } else if (matchName === 'urls') {
            const {method, path} = match.groups;

            // Create the action URL object
            const actionUrl = {};
            if (method !== '*') {
                actionUrl.method = method;
            }
            if (typeof path !== 'undefined') {
                actionUrl.path = path;
            }

            // Duplicate URL?
            if (urls.some((url) => url.method === actionUrl.method && url.path === actionUrl.path)) {
                const paddedPath = 'path' in actionUrl ? ` ${actionUrl.path}` : '';
                addError(`Duplicate URL: ${method}${paddedPath}`, filename, linenum);
            }

            // Add the URL
            urls.push(actionUrl);

        // Unrecognized line syntax
        } else {
            addError('Syntax error', filename, linenum);
        }
    }

    // Drop empty action urls arrays (type model requires len > 0 when present)
    for (const userTypeIter of Object.values(types)) {
        if ('action' in userTypeIter) {
            const actionType = userTypeIter.action;
            if ('urls' in actionType && actionType.urls.length === 0) {
                delete actionType.urls;
            }
        }
    }

    // Validate the type model, if requested
    if (validate) {
        for (const [typeName, memberName, errorMsg] of validateTypeModelErrors(types)) {
            let errorFilename = filename;
            let errorLinenum = null;
            if (memberName !== null) {
                errorLinenum = filepos[`${typeName}.${memberName}`] ?? null;
            }
            if (errorLinenum === null) {
                errorLinenum = Object.hasOwn(filepos, typeName) ? filepos[typeName] : null;
            }
            if (errorLinenum === null) {
                errorFilename = '';
                errorLinenum = 1;
            }
            addError(errorMsg, errorFilename, errorLinenum);
        }
    }

    // Raise a parser exception if there are any errors
    const errors = Array.from(Object.values(errorMap)).sort(compareTuple).map(([,, msg]) => msg);
    if (errors.length) {
        throw new SchemaMarkdownParserError(errors);
    }

    return types;
}


function compareTuple(v1, v2) {
    return v1.reduce((tot, val, idx) => (tot !== 0 ? tot : (val < v2[idx] ? -1 : (val > v2[idx] ? 1 : 0))), 0);
}


// Helper function to parse a typedef - returns a type-model and attributes-model tuple
function parseTypedef(matchTypedef) {
    const arrayAttrsString = matchTypedef.groups.array;
    const dictAttrsString = matchTypedef.groups.dict;

    // Array type?
    if (typeof arrayAttrsString !== 'undefined') {
        const valueTypeName = matchTypedef.groups.type;
        const valueAttr = parseAttr(matchTypedef.groups.attrs);
        const arrayType = {'type': createType(valueTypeName)};
        if (valueAttr !== null) {
            arrayType.attr = valueAttr;
        }
        return [{'array': arrayType}, parseAttr(arrayAttrsString)];
    }

    // Dictionary type?
    if (typeof dictAttrsString !== 'undefined') {
        let dictType;
        let valueTypeName = matchTypedef.groups.dictValueType;
        if (typeof valueTypeName !== 'undefined') {
            const valueAttr = parseAttr(matchTypedef.groups.dictValueAttrs);
            const keyTypeName = matchTypedef.groups.type;
            const keyAttr = parseAttr(matchTypedef.groups.attrs);
            dictType = {
                'type': createType(valueTypeName),
                'keyType': createType(keyTypeName)
            };
            if (valueAttr !== null) {
                dictType.attr = valueAttr;
            }
            if (keyAttr !== null) {
                dictType.keyAttr = keyAttr;
            }
        } else {
            valueTypeName = matchTypedef.groups.type;
            const valueAttr = parseAttr(matchTypedef.groups.attrs);
            dictType = {'type': createType(valueTypeName)};
            if (valueAttr !== null) {
                dictType.attr = valueAttr;
            }
        }
        return [{'dict': dictType}, parseAttr(dictAttrsString)];
    }

    // Non-container type...
    const memberTypeName = matchTypedef.groups.type;
    return [createType(memberTypeName), parseAttr(matchTypedef.groups.attrs)];
}


// Helper function to create a type model
function createType(typeName) {
    if (Object.hasOwn(builtinDeprecated, typeName)) {
        return {'builtin': builtinDeprecated[typeName]};
    }
    if (builtinTypes.has(typeName)) {
        return {'builtin': typeName};
    }
    return {'user': typeName};
}


// Helper function to parse an attributes string - returns an attributes model
function parseAttr(attrsString) {
    let attrs = null;
    if (typeof attrsString !== 'undefined') {
        for (const [attrString] of attrsString.matchAll(rFindAttrs)) {
            if (attrs === null) {
                attrs = {};
            }
            const matchAttr = attrString.match(rAttrGroup);
            const attrOp = matchAttr.groups.op;
            const attrLengthOp = matchAttr.groups.lop;

            if (typeof matchAttr.groups.nullable !== 'undefined') {
                attrs.nullable = true;
            } else if (typeof attrOp !== 'undefined') {
                const attrValue = parseFloat(matchAttr.groups.opnum);
                if (attrOp === '<') {
                    attrs.lt = attrValue;
                } else if (attrOp === '<=') {
                    attrs.lte = attrValue;
                } else if (attrOp === '>') {
                    attrs.gt = attrValue;
                } else if (attrOp === '>=') {
                    attrs.gte = attrValue;
                } else {
                    attrs.eq = attrValue;
                }
            } else {
                // typeof attrLengthOp !== 'undefined'
                const attrValue = parseInt(matchAttr.groups.lopnum, 10);
                if (attrLengthOp === '<') {
                    attrs.lenLT = attrValue;
                } else if (attrLengthOp === '<=') {
                    attrs.lenLTE = attrValue;
                } else if (attrLengthOp === '>') {
                    attrs.lenGT = attrValue;
                } else if (attrLengthOp === '>=') {
                    attrs.lenGTE = attrValue;
                } else {
                    attrs.lenEq = attrValue;
                }
            }
        }
    }
    return attrs;
}


/**
 * Schema Markdown parser error
 *
 * @extends {Error}
 * @property {string[]} errors - The list of error strings
 */
export class SchemaMarkdownParserError extends Error {
    /**
     * Create a Schema Markdown parser error instance
     *
     * @param {string[]} errors - The list of error strings
     */
    constructor(errors) {
        super(errors.join('\n'));
        this.name = this.constructor.name;
        this.errors = errors;
    }
}
