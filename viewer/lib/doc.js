// doc.js - the road plan model documentation page

import {argsLink} from './args.js';
import {escapeHtml, headerId} from './format.js';
import {attrOps} from './schema.js';
import {roadieTypes} from './model.js';


// Build the model documentation page HTML
export function buildDoc(globals) {
    const html = [`<p>${argsLink(globals, 'Back', {'doc': null})}</p>`];
    html.push(typeHtml('RoadPlan', 1));

    // The referenced types, sorted by name
    const referenced = new Set();
    referencedTypes('RoadPlan', referenced);
    referenced.delete('RoadPlan');
    if (referenced.size > 0) {
        html.push('<hr>', '<h2 id="referenced-types">Referenced Types</h2>');
        for (const typeName of [...referenced].sort()) {
            html.push(typeHtml(typeName, 3));
        }
    }
    return {'title': 'Roadie Road Plan Model', 'html': html.join('\n')};
}


// Add a user type's referenced user types to a set
function referencedTypes(typeName, referenced) {
    if (referenced.has(typeName)) {
        return;
    }
    referenced.add(typeName);
    const userType = roadieTypes[typeName];
    const memberTypes = [];
    if ('struct' in userType) {
        memberTypes.push(...userType.struct.members.map((member) => member.type));
    } else if ('typedef' in userType) {
        memberTypes.push(userType.typedef.type);
    }
    for (let type of memberTypes) {
        while ('array' in type) {
            ({type} = type.array);
        }
        if ('user' in type) {
            referencedTypes(type.user, referenced);
        }
    }
}


// Create a user type's documentation HTML
function typeHtml(typeName, level) {
    const userType = roadieTypes[typeName];
    const [kind] = Object.keys(userType);
    const typeModel = userType[kind];
    const title = `${kind} ${typeName}`;
    const html = [`<h${level} id="${headerId(title)}">${escapeHtml(title)}</h${level}>`];
    if (typeModel.doc.length > 0) {
        html.push(`<p>${escapeHtml(typeModel.doc.join(' '))}</p>`);
    }
    if (kind === 'struct') {
        html.push(table(['Name', 'Type', 'Attributes', 'Description'], typeModel.members.map((member) => [
            escapeHtml(member.name),
            typeText(member.type),
            attrText(member.type, member.attr ?? null, member.optional),
            escapeHtml(member.doc.join(' '))
        ])));
    } else if (kind === 'enum') {
        const hasDoc = typeModel.values.some((value) => value.doc.length > 0);
        html.push(table(hasDoc ? ['Value', 'Description'] : ['Value'], typeModel.values.map((value) => (
            hasDoc ? [escapeHtml(value.name), escapeHtml(value.doc.join(' '))] : [escapeHtml(value.name)]
        ))));
    } else {
        html.push(table(['Type', 'Attributes'], [[typeText(typeModel.type), attrText(typeModel.type, typeModel.attr, false)]]));
    }
    return html.join('\n');
}


// Create a type's HTML text - user types link to their documentation
function typeText(type) {
    if ('array' in type) {
        return `${typeText(type.array.type)} []`;
    } else if ('user' in type) {
        const [kind] = Object.keys(roadieTypes[type.user]);
        return `<a href="#${headerId(`${kind} ${type.user}`)}">${escapeHtml(type.user)}</a>`;
    }
    return escapeHtml(type.builtin);
}


// Create a member's attributes HTML text
function attrText(type, attr, optional) {
    const parts = optional ? ['optional'] : [];
    if (attr !== null) {
        for (const [name, op] of Object.entries(attrOps)) {
            if (name in attr) {
                if (name.startsWith('len')) {
                    parts.push(`len(${'array' in type ? 'array' : 'value'}) ${op} ${attr[name]}`);
                } else {
                    parts.push(`value ${op} ${attr[name]}`);
                }
            }
        }
    }
    return parts.map(escapeHtml).join('<br>');
}


function table(fields, rows) {
    return `<table><thead><tr>${fields.map((field) => `<th style="text-align: left">${field}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td style="text-align: left">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
