-- v1.18.5 PATH: Thursday Imp Spec account-update reminder.
-- Adds STATUS_UPDATE_DUE to notification_type (staff-only, email default on).

ALTER TYPE "public"."notification_type" ADD VALUE 'STATUS_UPDATE_DUE';
