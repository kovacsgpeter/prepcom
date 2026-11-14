#!/usr/bin/env node
/**
 * dev-workflow (ORD-376, 4.27.0)
 *
 * Saját, kis JSON Schema részhalmaz-validátor, függőség nélkül.
 *
 * Használat:
 *   node validate-run-metrics.js <fájl.jsonl> [séma.json]
 *
 * Kilépési kódok:
 *   0: minden sor érvényes
 *   1: hiba történt (validálási hiba vagy feldolgozási hiba)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SUPPORTED_KEYWORDS = [
  'type',
  'enum',
  'const',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'pattern',
  'maxLength',
  'minimum',
];

const META_KEYWORDS = ['$schema', '$id', 'title', 'description'];

/**
 * Ellenőrzi, hogy a séma csak támogatott kulcsszavakat vagy metaadatokat tartalmaz.
 * @param {object} schema
 * @param {string} schemaPath
 * @throws {Error} Ha ismeretlen kulcsszó van.
 */
function validateSchemaStructure(schema, schemaPath) {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return;
  }

  const keys = Object.keys(schema);
  for (const key of keys) {
    if (META_KEYWORDS.includes(key)) {
      continue;
    }
    if (SUPPORTED_KEYWORDS.includes(key)) {
      // Rekurzív ellenőrzés az al-sémákra
      if (key === 'properties' && typeof schema[key] === 'object' && schema[key] !== null) {
        const propKeys = Object.keys(schema[key]);
        for (const propKey of propKeys) {
          validateSchemaStructure(schema[key][propKey], `${schemaPath}.${propKey}`);
        }
      } else if (key === 'items' && typeof schema[key] === 'object' && schema[key] !== null) {
        validateSchemaStructure(schema[key], `${schemaPath}.items`);
      } else if (key === 'additionalProperties' && typeof schema[key] === 'object' && schema[key] !== null) {
        validateSchemaStructure(schema[key], `${schemaPath}.additionalProperties`);
      }
    } else {
      throw new Error(`ismeretlen séma-kulcsszó: ${key} (${schemaPath})`);
    }
  }
}

/**
 * Validál egy értéket a séma szerint.
 * @param {*} value
 * @param {object} schema
 * @param {string} path
 * @returns {string[]} Hibaüzenetek listája.
 */
function validate(value, schema, path) {
  const errors = [];

  if (typeof schema !== 'object' || schema === null) {
    return errors;
  }

  // Type ellenőrzés
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    let typeMatch = false;

    if (types.includes('null') && value === null) {
      typeMatch = true;
    } else {
      for (const t of types) {
        if (checkType(value, t)) {
          typeMatch = true;
          break;
        }
      }
    }

    if (!typeMatch) {
      const typeStr = types.length === 1 ? types[0] : types.join(' vagy ');
      errors.push(`${path}: típus nem ${typeStr}`);
      return errors; // Ha a típus hibás, ne adjunk további hibát
    }

    // Ha null és a típus tartalmazza, ugorjuk át a többit
    if (value === null) {
      return errors;
    }
  }

  // Enum ellenőrzés
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      errors.push(`${path}: nem megengedett érték`);
    }
  }

  // Const ellenőrzés
  if (schema.const !== undefined) {
    if (value !== schema.const) {
      errors.push(`${path}: nem a várt állandó`);
    }
  }

  // Objektum specifikus ellenőrzések
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    // Required ellenőrzés
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          const keyPath = path === '$' ? key : `${path}.${key}`;
          errors.push(`${keyPath}: hiányzó kötelező mező`);
        }
      }
    }

    // Properties ellenőrzés
    if (schema.properties) {
      for (const key of Object.keys(value)) {
        if (schema.properties[key]) {
          const keyPath = path === '$' ? key : `${path}.${key}`;
          const propErrors = validate(value[key], schema.properties[key], keyPath);
          errors.push(...propErrors);
        }
      }
    }

    // AdditionalProperties ellenőrzés
    if (schema.additionalProperties !== undefined) {
      const knownKeys = schema.properties ? Object.keys(schema.properties) : [];
      const unknownKeys = Object.keys(value).filter(k => !knownKeys.includes(k));

      if (schema.additionalProperties === false) {
        for (const key of unknownKeys) {
          const keyPath = path === '$' ? key : `${path}.${key}`;
          errors.push(`${keyPath}: ismeretlen kulcs`);
        }
      } else if (typeof schema.additionalProperties === 'object' && schema.additionalProperties !== null) {
        for (const key of unknownKeys) {
          const keyPath = path === '$' ? key : `${path}.${key}`;
          const propErrors = validate(value[key], schema.additionalProperties, keyPath);
          errors.push(...propErrors);
        }
      }
    }
  }

  // Tömb specifikus ellenőrzések
  if (Array.isArray(value)) {
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const itemPath = `${path}[${i}]`;
        const itemErrors = validate(value[i], schema.items, itemPath);
        errors.push(...itemErrors);
      }
    }
  }

  // String specifikus ellenőrzések
  if (typeof value === 'string') {
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push(`${path}: nem illeszkedik a mintára`);
      }
    }
    if (schema.maxLength !== undefined) {
      if (value.length > schema.maxLength) {
        errors.push(`${path}: túl hosszú`);
      }
    }
  }

  // Number specifikus ellenőrzések
  if (typeof value === 'number') {
    if (schema.minimum !== undefined) {
      if (value < schema.minimum) {
        errors.push(`${path}: kisebb a megengedettnél`);
      }
    }
  }

  return errors;
}

/**
 * Ellenőrzi, hogy az érték megfelel-e a típusnak.
 * @param {*} value
 * @param {string} type
 * @returns {boolean}
 */
function checkType(value, type) {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

/**
 * Validál egy sort a séma szerint.
 * @param {object} row
 * @param {object} schema
 * @returns {string[]} Hibaüzenetek listája.
 */
function validateRow(row, schema) {
  // Először ellenőrizzük a séma struktúráját
  validateSchemaStructure(schema, '$');
  return validate(row, schema, '$');
}

/**
 * Betölti a séma fájlt.
 * @param {string} [filePath]
 * @returns {object}
 */
function loadSchema(filePath) {
  const targetPath = filePath || path.join(__dirname, '..', 'schemas', 'run-metrics.v1.json');
  const content = fs.readFileSync(targetPath, 'utf-8');
  return JSON.parse(content);
}

// Exportok
module.exports = {
  validateRow,
  loadSchema,
  SUPPORTED_KEYWORDS,
};

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Használat: node validate-run-metrics.js <fájl.jsonl> [séma.json]');
    process.exit(1);
  }

  const jsonlFile = args[0];
  const schemaFile = args[1];

  let schema;
  try {
    schema = loadSchema(schemaFile);
  } catch (e) {
    console.error(`Séma betöltési hiba: ${e.message}`);
    process.exit(1);
  }

  let content;
  try {
    content = fs.readFileSync(jsonlFile, 'utf-8');
  } catch (e) {
    console.error(`Fájl olvasási hiba: ${e.message}`);
    process.exit(1);
  }

  const lines = content.split('\n');
  let validCount = 0;
  let hasErrors = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    let row;
    try {
      row = JSON.parse(line);
    } catch (e) {
      console.error(`sor ${i + 1}: JSON parse hiba: ${e.message}`);
      hasErrors = true;
      continue;
    }

    const errors = validateRow(row, schema);
    if (errors.length > 0) {
      for (const error of errors) {
        console.error(`sor ${i + 1}: ${error}`);
      }
      hasErrors = true;
    } else {
      validCount++;
    }
  }

  if (!hasErrors) {
    console.log(`${validCount} sor érvényes`);
    process.exit(0);
  } else {
    process.exit(1);
  }
}
