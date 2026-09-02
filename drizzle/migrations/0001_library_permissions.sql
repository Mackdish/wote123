-- Library access permissions per role (admin controlled)
-- Mirrors public.report_permissions but gates the Document Library
-- (Department -> Trainer -> Document type folder browser).
-- By default only the Deputy Principal and Administrators can browse it;
-- HOD/IQA/Trainer keep using the regular Documents list for their reviews.
CREATE TABLE public.library_permissions (
  role public.app_role PRIMARY KEY,
  can_view_library boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_permissions TO authenticated;
GRANT ALL ON public.library_permissions TO service_role;

ALTER TABLE public.library_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY library_permissions_read ON public.library_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY library_permissions_admin_write ON public.library_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.library_permissions (role, can_view_library) VALUES
  ('admin', true),
  ('deputy_principal', true),
  ('hod', false),
  ('iqa', false),
  ('trainer', false);

CREATE OR REPLACE FUNCTION public.can_view_library(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.library_permissions lp ON lp.role = ur.role
    WHERE ur.user_id = _user_id AND lp.can_view_library
  )
$$;

CREATE TRIGGER library_permissions_updated_at
  BEFORE UPDATE ON public.library_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
