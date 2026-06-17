-- Tokens are now stored as SHA-256 hashes of the value that's mailed to the
-- user. Any rows still sitting in these tables predate the change and contain
-- plaintext tokens that no longer match the hash lookup; purging is safer
-- than leaving dead tokens that could be reused if the column were re-enabled
-- in plaintext mode by accident.

DELETE FROM "PasswordResetToken";
DELETE FROM "EmailChangeRequest";
