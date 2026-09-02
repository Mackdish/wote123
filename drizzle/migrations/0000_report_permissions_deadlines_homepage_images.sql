-- 1. Report access permissions per role (admin controlled)
CREATE TABLE public.report_permissions (
  role public.app_role PRIMARY KEY,
  can_view_reports boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_permissions TO authenticated;
GRANT ALL ON public.report_permissions TO service_role;

ALTER TABLE public.report_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_permissions_read ON public.report_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY report_permissions_admin_write ON public.report_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.report_permissions (role, can_view_reports) VALUES
  ('admin', true),
  ('deputy_principal', true),
  ('hod', true),
  ('iqa', true),
  ('trainer', false);

CREATE OR REPLACE FUNCTION public.can_view_reports(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.report_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.can_view_reports
  )
$$;

-- 2. Submission deadlines per document type + department
CREATE TABLE public.submission_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type public.document_type NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  academic_year text,
  term text,
  due_date date NOT NULL,
  allow_late boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX submission_deadlines_unique
  ON public.submission_deadlines (
    document_type,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(academic_year, ''),
    COALESCE(term, '')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_deadlines TO authenticated;
GRANT ALL ON public.submission_deadlines TO service_role;

ALTER TABLE public.submission_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY deadlines_read_all ON public.submission_deadlines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deadlines_admin_write ON public.submission_deadlines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER submission_deadlines_updated_at
  BEFORE UPDATE ON public.submission_deadlines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Document type settings (labels + enable/disable) managed by admins
CREATE TABLE public.document_type_settings (
  document_type public.document_type PRIMARY KEY,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_type_settings TO authenticated;
GRANT ALL ON public.document_type_settings TO service_role;

ALTER TABLE public.document_type_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY dts_read_all ON public.document_type_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dts_admin_write ON public.document_type_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.document_type_settings (document_type, label, sort_order) VALUES
  ('scheme_of_work', 'Scheme of Work', 1),
  ('session_plan', 'Session Plan', 2),
  ('record_of_work', 'Record of Work', 3),
  ('training_program', 'Training Program', 4),
  ('learning_plan', 'Learning Plan', 5),
  ('lesson_notes', 'Lesson Notes', 6),
  ('assessment_document', 'Assessment Document', 7),
  ('iqa_document', 'IQA Document', 8),
  ('course_outline', 'Course Outline', 9),
  ('other', 'Other', 10);

-- 4. Homepage images managed from the admin panel
CREATE TABLE public.homepage_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.homepage_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_images TO authenticated;
GRANT ALL ON public.homepage_images TO service_role;

ALTER TABLE public.homepage_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY homepage_images_public_read ON public.homepage_images
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY homepage_images_admin_write ON public.homepage_images
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER homepage_images_updated_at
  BEFORE UPDATE ON public.homepage_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Storage policies for the site-images bucket (public read, admin write)
CREATE POLICY "site_images_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'site-images');
CREATE POLICY "site_images_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "site_images_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'site-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "site_images_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'site-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
