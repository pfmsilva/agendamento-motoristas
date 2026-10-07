DROP TRIGGER IF EXISTS analytics_dashboards_audit ON public.analytics_dashboards;
CREATE TRIGGER analytics_dashboards_audit
AFTER INSERT OR UPDATE OR DELETE ON public.analytics_dashboards
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('analytics_dashboard');
DROP TRIGGER IF EXISTS analytics_widgets_audit ON public.analytics_widgets;
CREATE TRIGGER analytics_widgets_audit
AFTER INSERT OR UPDATE OR DELETE ON public.analytics_widgets
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes('analytics_widget');