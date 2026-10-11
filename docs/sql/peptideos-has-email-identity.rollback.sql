-- Rollback for docs/sql/peptideos-has-email-identity.sql

DROP FUNCTION IF EXISTS wc.peptideos_has_email_identity(uuid);
