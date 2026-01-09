/**
 * Schema inference utility for MongoDB collections
 * Analyzes existing documents to infer field types, patterns, and constraints
 */

/**
 * Analyze a collection to infer its schema
 * @param {Collection} collection - MongoDB collection
 * @param {number} sampleSize - Number of documents to sample (default: 100)
 * @returns {Promise<Object>} Inferred schema
 */
async function inferSchema(collection, sampleSize = 100) {
  const schema = {};
  const fieldStats = {};
  
  // Sample documents from the collection
  const sampleDocs = await collection
    .find({})
    .limit(sampleSize)
    .toArray();
  
  if (sampleDocs.length === 0) {
    return { fields: {}, isEmpty: true };
  }
  
  // Analyze each document
  sampleDocs.forEach(doc => {
    analyzeDocument(doc, fieldStats, '');
  });
  
  // Convert stats to schema
  const totalDocs = sampleDocs.length;
  Object.keys(fieldStats).forEach(fieldPath => {
    const stats = fieldStats[fieldPath];
    // Collect all values for examples
    const allValues = [
      ...stats.stringValues,
      ...stats.numberValues,
      ...stats.booleanValues.map(b => b.toString()),
      ...stats.dateValues,
    ];
    
    const fieldSchema = {
      type: determineType(stats),
      nullable: stats.nullCount > 0,
      presence: stats.presentCount / totalDocs,
      examples: getUniqueExamples(allValues, 5),
    };
    
    // Detect enums (if all values are from a small set of unique strings)
    if (fieldSchema.type === 'string' && stats.uniqueStringValues.size > 0 && stats.uniqueStringValues.size <= 10) {
      const uniqueValues = Array.from(stats.uniqueStringValues);
      // If most documents use values from this set, treat as enum
      const enumUsage = stats.stringValues.filter(v => uniqueValues.includes(v)).length;
      if (enumUsage / stats.stringValues.length > 0.8) {
        fieldSchema.enum = uniqueValues;
        fieldSchema.type = 'enum';
      }
    }
    
    // Detect date patterns
    if (fieldSchema.type === 'date') {
      fieldSchema.format = 'datetime-local';
    }
    
    // Detect boolean
    if (fieldSchema.type === 'boolean') {
      fieldSchema.default = false;
    }
    
    // Detect number ranges
    if (fieldSchema.type === 'number') {
      if (stats.numberValues.length > 0) {
        fieldSchema.min = Math.min(...stats.numberValues);
        fieldSchema.max = Math.max(...stats.numberValues);
      }
    }
    
    // Detect array types
    if (fieldSchema.type === 'array' && stats.arrayItemTypes.size > 0) {
      const itemTypes = Array.from(stats.arrayItemTypes);
      if (itemTypes.length === 1) {
        fieldSchema.items = { type: itemTypes[0] };
      }
    }
    
    // Handle nested objects - check if this field path indicates nesting
    const pathParts = fieldPath.split('.');
    if (pathParts.length > 1) {
      // This is a nested field - need to create parent object structure
      let current = schema;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!current[part]) {
          current[part] = { type: 'object', fields: {} };
        } else if (current[part].type !== 'object' || !current[part].fields) {
          // Convert existing field to object type
          const existing = current[part];
          current[part] = { type: 'object', fields: {} };
          // If it was a simple field, we might lose it, but that's okay for schema inference
        }
        current = current[part].fields;
      }
      current[pathParts[pathParts.length - 1]] = fieldSchema;
    } else {
      // Top-level field
      schema[fieldPath] = fieldSchema;
    }
  });
  
  return { fields: schema, isEmpty: false };
}

/**
 * Analyze a single document and update field statistics
 */
function analyzeDocument(doc, fieldStats, prefix = '') {
  if (!doc || typeof doc !== 'object') return;
  
  Object.keys(doc).forEach(key => {
    if (key === '_id') return; // Skip _id
    
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const value = doc[key];
    
    if (!fieldStats[fieldPath]) {
      fieldStats[fieldPath] = {
        presentCount: 0,
        nullCount: 0,
        stringValues: [],
        numberValues: [],
        booleanValues: [],
        dateValues: [],
        objectValues: [],
        arrayValues: [],
        uniqueStringValues: new Set(),
        arrayItemTypes: new Set(),
      };
    }
    
    const stats = fieldStats[fieldPath];
    
    if (value === null || value === undefined) {
      stats.nullCount++;
    } else {
      stats.presentCount++;
      
      if (typeof value === 'string') {
        stats.stringValues.push(value);
        stats.uniqueStringValues.add(value);
        
        // Check if it's a date string
        if (isDateString(value)) {
          stats.dateValues.push(value);
        }
      } else if (typeof value === 'number') {
        stats.numberValues.push(value);
      } else if (typeof value === 'boolean') {
        stats.booleanValues.push(value);
      } else if (value instanceof Date) {
        stats.dateValues.push(value.toISOString());
      } else if (value.$date) {
        stats.dateValues.push(value.$date);
      } else if (value.$oid) {
        // ObjectId - treat as string
        stats.stringValues.push(value.$oid);
      } else if (Array.isArray(value)) {
        stats.arrayValues.push(value.length);
        value.forEach(item => {
          if (typeof item === 'string') stats.arrayItemTypes.add('string');
          else if (typeof item === 'number') stats.arrayItemTypes.add('number');
          else if (typeof item === 'boolean') stats.arrayItemTypes.add('boolean');
          else if (typeof item === 'object') stats.arrayItemTypes.add('object');
        });
      } else if (typeof value === 'object') {
        stats.objectValues.push(value);
        // Recursively analyze nested objects
        analyzeDocument(value, fieldStats, fieldPath);
      }
    }
  });
}

/**
 * Determine the primary type for a field based on statistics
 */
function determineType(stats) {
  const counts = {
    string: stats.stringValues.length,
    number: stats.numberValues.length,
    boolean: stats.booleanValues.length,
    date: stats.dateValues.length,
    array: stats.arrayValues.length,
    object: stats.objectValues.length,
  };
  
  // Find the most common type
  let maxCount = 0;
  let primaryType = 'string'; // default
  
  Object.keys(counts).forEach(type => {
    if (counts[type] > maxCount) {
      maxCount = counts[type];
      primaryType = type;
    }
  });
  
  return primaryType;
}

/**
 * Check if a string looks like a date
 */
function isDateString(str) {
  if (typeof str !== 'string') return false;
  // ISO date format
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) return true;
  // Common date formats
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return true;
  return false;
}

/**
 * Get unique example values
 */
function getUniqueExamples(values, max = 5) {
  const unique = [...new Set(values)];
  return unique.slice(0, max);
}

module.exports = {
  inferSchema,
};
