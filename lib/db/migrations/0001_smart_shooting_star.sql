ALTER TABLE "Message" DROP CONSTRAINT "Message_documentId_Document_id_fk";
--> statement-breakpoint
ALTER TABLE "Message" DROP COLUMN IF EXISTS "documentId";