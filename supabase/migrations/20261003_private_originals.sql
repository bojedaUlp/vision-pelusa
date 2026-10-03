-- Protected previews (step 2 of 2). Run ONLY after:
--   1. 20261003_protected_previews.sql is applied,
--   2. the new code is deployed,
--   3. the admin panel shows 0 photos pending in "Generar previews protegidas".
--
-- After this, original URLs stop working publicly. Purchased downloads keep working:
-- /api/download signs them server-side with the service role.

update storage.buckets set public = false where id = 'photos';

-- Check: should return public = false.
-- select id, public from storage.buckets where id in ('photos', 'previews');
