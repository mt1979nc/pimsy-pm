/**
 * Points the tests at a throwaway database. Must run before any module that
 * reads DATABASE_URL at import time.
 */
process.env.DATABASE_URL ??= "postgresql://claude@localhost:5433/pimsy_test";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.AUTH_SECRET ??= "test-secret-value-not-used-for-anything-real";

process.env.INTERNAL_EMAIL_DOMAINS ??= "pimsyehr.com";
