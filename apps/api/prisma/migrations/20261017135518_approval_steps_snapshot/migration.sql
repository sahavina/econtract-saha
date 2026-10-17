/*
  Warnings:

  - Added the required column `stepsSnapshot` to the `ApprovalRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "stepsSnapshot" JSONB NOT NULL;
