/**
 * Load environment variables before any other app code.
 * Must be imported first in index.ts so ADMIN_TOKEN and other vars are set before routes load.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();
dotenv.config({
  path: path.join(process.cwd(), '..', '..', '.env'),
});
