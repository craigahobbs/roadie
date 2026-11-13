// Licensed under the MIT License
// https://github.com/craigahobbs/schema-markdown-js/blob/main/LICENSE

/** @module lib/encode */


/**
 * Encode an object as a query/hash string. Dictionaries, lists, and tuples are recursed. Each member key is expressed
 * in fully-qualified form. List keys are the index into the list, and are in order.
 *
 * @param {Object} obj - The parameters object
 * @returns {string}
 */
export function encodeQueryString(obj) {
    return encodeQueryStringHelper(obj).join('&');
}


// Helper function for encodeQueryString
function encodeQueryStringHelper(obj, memberFqn = null, keyValues = []) {
    const objType = typeof obj;
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            keyValues.push(memberFqn !== null ? `${memberFqn}=` : '');
        } else {
            for (let ix = 0; ix < obj.length; ix++) {
                encodeQueryStringHelper(obj[ix], memberFqn !== null ? `${memberFqn}.${ix}` : `${ix}`, keyValues);
            }
        }
    } else if (obj instanceof Date) {
        const objEncoded = encodeURIComponent(obj.toISOString());
        keyValues.push(memberFqn !== null ? `${memberFqn}=${objEncoded}` : `${objEncoded}`);
    } else if (obj !== null && typeof obj === 'object') {
        const keys = Object.keys(obj).sort();
        if (keys.length === 0) {
            keyValues.push(memberFqn !== null ? `${memberFqn}=` : '');
        } else {
            for (const key of keys) {
                const keyEncoded = encodeQueryStringHelper(key);
                encodeQueryStringHelper(obj[key], memberFqn !== null ? `${memberFqn}.${keyEncoded}` : `${keyEncoded}`, keyValues);
            }
        }
    } else if (obj === null || objType === 'boolean' || objType === 'number') {
        keyValues.push(memberFqn !== null ? `${memberFqn}=${obj}` : `${obj}`);
    } else {
        const objEncoded = encodeURIComponent(obj);
        keyValues.push(memberFqn !== null ? `${memberFqn}=${objEncoded}` : `${objEncoded}`);
    }
    return keyValues;
}


/**
 * Decode an object from a query/hash string. Each member key of the query string is expressed in fully-qualified
 * form. List keys are the index into the list, must be in order.
 *
 * @param {string} paramStr - The parameters string
 * @returns {Object}
 */
export function decodeQueryString(paramStr) {
    // Decode the parameter string key/values
    const result = [null];
    const keyValues = paramStr.split('&');
    keyValues.forEach((keyValue, ixKeyValue) => {
        const [keyFqn, valueEncoded = null] = keyValue.split('=', 2);
        if (valueEncoded === null) {
            // Ignore hash IDs
            if (ixKeyValue === keyValues.length - 1) {
                return;
            }
            throw new Error(`Invalid key/value pair '${keyValue.slice(0, 100)}'`);
        }
        const value = decodeURIComponent(valueEncoded);

        // Find/create the object on which to set the value
        let parent = result;
        let keyParent = 0;
        const keys = keyFqn.split('.');
        for (const keyEncoded of keys) {
            let key = decodeURIComponent(keyEncoded);
            let obj = parent[keyParent];

            // Array key?  First "key" of an array must start with "0".
            if (Array.isArray(obj) || (obj === null && key === '0')) {
                // Create this key's container, if necessary
                if (obj === null) {
                    obj = [];
                    parent[keyParent] = obj;
                }

                // Parse the key as an integer
                if (isNaN(key)) {
                    throw new Error(`Invalid array index '${key.slice(0, 100)}' in key '${keyFqn.slice(0, 100)}'`);
                }
                const keyOrig = key;
                key = parseInt(key, 10);

                // Append the value placeholder null
                if (key === obj.length) {
                    obj.push(null);
                } else if (key < 0 || key > obj.length) {
                    throw new Error(`Invalid array index '${keyOrig.slice(0, 100)}' in key '${keyFqn.slice(0, 100)}'`);
                }
            } else {
                // Create this key's container, if necessary
                if (obj === null) {
                    obj = {};
                    parent[keyParent] = obj;
                } else if (typeof obj !== 'object') {
                    throw new Error(`Invalid key '${keyFqn.slice(0, 100)}'`);
                }

                // Create the index for this key - check own properties only, and define "__proto__"
                // directly since assignment would invoke the prototype setter
                if (!Object.hasOwn(obj, key)) {
                    if (key === '__proto__') {
                        Object.defineProperty(obj, key, {'value': null, 'enumerable': true, 'writable': true, 'configurable': true});
                    } else {
                        obj[key] = null;
                    }
                }
            }

            // Update the parent object and key
            parent = obj;
            keyParent = key;
        }

        // Set the value
        if (parent[keyParent] !== null) {
            throw new Error(`Duplicate key '${keyFqn.slice(0, 100)}'`);
        }
        parent[keyParent] = value;
    });

    return result[0] !== null ? result[0] : {};
}


/**
 * JSON-stringify an object with sorted keys
 *
 * @param {Object} obj - The object to stringify
 * @returns {string}
 */
export function jsonStringifySortKeys(value, space) {
    // JSON-stringify non-objects without creating a key set
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value, null, space);
    }

    // JSON-stringify with sorted keys
    const keySet = new Set();
    getObjectKeys(value, keySet);
    const sortedKeys = Array.from(keySet.values()).sort();
    return JSON.stringify(value, sortedKeys, space);
}


// Helper function to get an object keys (deep)
function getObjectKeys(value, keySet) {
    if (value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
            for (const subValue of value) {
                getObjectKeys(subValue, keySet);
            }
        } else {
            for (const [subKey, subValue] of Object.entries(value)) {
                keySet.add(subKey);
                getObjectKeys(subValue, keySet);
            }
        }
    }
}
