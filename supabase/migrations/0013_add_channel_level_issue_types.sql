DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'low_battery'
      AND enumtypid = 'public.issue_type'::regtype
  ) THEN
    ALTER TYPE public.issue_type ADD VALUE 'low_battery';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'poor_signal'
      AND enumtypid = 'public.issue_type'::regtype
  ) THEN
    ALTER TYPE public.issue_type ADD VALUE 'poor_signal';
  END IF;
END $$;