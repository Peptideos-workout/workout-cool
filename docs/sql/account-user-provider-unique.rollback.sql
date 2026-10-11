-- Rollback for docs/sql/account-user-provider-unique.sql

DROP INDEX IF EXISTS wc."account_userId_providerId_key";
