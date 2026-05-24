process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://darts:darts@localhost:5432/darts_test";
process.env.AUTH_SECRET ??= "test-secret";
process.env.AUTH_URL ??= "http://localhost:3000";
process.env.UPLOADTHING_TOKEN ??= "test-token";
