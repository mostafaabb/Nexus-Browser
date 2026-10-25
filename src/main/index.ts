/**
 * Nexus Browser — main process entry point.
 *
 * The bootstrap runs as early as possible so that the single instance lock is
 * acquired before any window or database connection is created.
 */

import { bootstrap } from './app/bootstrap'

bootstrap()
