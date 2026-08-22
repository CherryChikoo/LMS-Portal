const fs = require('fs');
const targetFile = 'src/lib/data/lms-data-cache.ts';
let content = fs.readFileSync(targetFile, 'utf8');

content = content.replace(
  'const CACHE_STORAGE_KEY = "lms_data_cache_v6";',
  'const CACHE_STORAGE_KEY = "lms_data_cache_v7";'
);

content = content.replace(
  'const oldVersions = ["lms_data_cache", "lms_data_cache_v2", "lms_data_cache_v3", "lms_data_cache_v4", "lms_data_cache_v5"];',
  'const oldVersions = ["lms_data_cache", "lms_data_cache_v2", "lms_data_cache_v3", "lms_data_cache_v4", "lms_data_cache_v5", "lms_data_cache_v6"];'
);

fs.writeFileSync(targetFile, content, 'utf8');
