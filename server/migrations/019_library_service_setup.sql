ALTER TABLE library_services ADD COLUMN setup_request_id text;
ALTER TABLE library_services ADD COLUMN setup_payload_hash text;
ALTER TABLE library_services ADD CONSTRAINT library_service_setup_receipt_check
  CHECK ((setup_request_id IS NULL) = (setup_payload_hash IS NULL));
CREATE UNIQUE INDEX library_service_setup_request_unique
  ON library_services (created_by, setup_request_id) WHERE setup_request_id IS NOT NULL;
