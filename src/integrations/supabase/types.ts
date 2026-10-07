export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          adjusted_at: string | null
          adjusted_by: string | null
          adjustment_approval_status: string | null
          adjustment_decided_at: string | null
          adjustment_decided_by: string | null
          adjustment_justification: string | null
          adjustment_proposed_end: string | null
          adjustment_proposed_start: string | null
          adjustment_reason_id: string | null
          adjustment_reason_label_snapshot: string | null
          adjustment_requested_at: string | null
          adjustment_requested_by: string | null
          adjustment_source: string | null
          administrator_id: string | null
          approval_decided_at: string | null
          approval_decided_by: string | null
          approval_status: string | null
          assigned_at: string | null
          assignment_attempts: Json | null
          assignment_status: Database["public"]["Enums"]["assignment_status"]
          assistant_id: string | null
          calculated_occupation_end: string | null
          calculated_occupation_start: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: Database["public"]["Enums"]["app_role"] | null
          city_id: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          driver_adjusted_end: string | null
          driver_adjusted_start: string | null
          driver_id: string | null
          effective_end: string | null
          effective_start: string | null
          end_datetime: string
          event_kind: Database["public"]["Enums"]["event_kind"]
          event_kind_key: string | null
          event_kind_label_snapshot: string | null
          id: string
          justification: string | null
          notes: string | null
          origin: string | null
          origin_city_id: string | null
          original_driver_id: string | null
          override_conflict: boolean
          reassign_overridden: boolean
          reassign_reason: string | null
          reassign_timeoff_id: string | null
          reassigned_at: string | null
          round_trip: boolean
          series_id: string | null
          series_index: number | null
          start_datetime: string
          status: Database["public"]["Enums"]["activity_status"]
          tag_id: string | null
          title: string
          travel_unknown: boolean
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjustment_approval_status?: string | null
          adjustment_decided_at?: string | null
          adjustment_decided_by?: string | null
          adjustment_justification?: string | null
          adjustment_proposed_end?: string | null
          adjustment_proposed_start?: string | null
          adjustment_reason_id?: string | null
          adjustment_reason_label_snapshot?: string | null
          adjustment_requested_at?: string | null
          adjustment_requested_by?: string | null
          adjustment_source?: string | null
          administrator_id?: string | null
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_status?: string | null
          assigned_at?: string | null
          assignment_attempts?: Json | null
          assignment_status?: Database["public"]["Enums"]["assignment_status"]
          assistant_id?: string | null
          calculated_occupation_end?: string | null
          calculated_occupation_start?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: Database["public"]["Enums"]["app_role"] | null
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          driver_adjusted_end?: string | null
          driver_adjusted_start?: string | null
          driver_id?: string | null
          effective_end?: string | null
          effective_start?: string | null
          end_datetime: string
          event_kind?: Database["public"]["Enums"]["event_kind"]
          event_kind_key?: string | null
          event_kind_label_snapshot?: string | null
          id?: string
          justification?: string | null
          notes?: string | null
          origin?: string | null
          origin_city_id?: string | null
          original_driver_id?: string | null
          override_conflict?: boolean
          reassign_overridden?: boolean
          reassign_reason?: string | null
          reassign_timeoff_id?: string | null
          reassigned_at?: string | null
          round_trip?: boolean
          series_id?: string | null
          series_index?: number | null
          start_datetime: string
          status?: Database["public"]["Enums"]["activity_status"]
          tag_id?: string | null
          title: string
          travel_unknown?: boolean
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adjusted_at?: string | null
          adjusted_by?: string | null
          adjustment_approval_status?: string | null
          adjustment_decided_at?: string | null
          adjustment_decided_by?: string | null
          adjustment_justification?: string | null
          adjustment_proposed_end?: string | null
          adjustment_proposed_start?: string | null
          adjustment_reason_id?: string | null
          adjustment_reason_label_snapshot?: string | null
          adjustment_requested_at?: string | null
          adjustment_requested_by?: string | null
          adjustment_source?: string | null
          administrator_id?: string | null
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_status?: string | null
          assigned_at?: string | null
          assignment_attempts?: Json | null
          assignment_status?: Database["public"]["Enums"]["assignment_status"]
          assistant_id?: string | null
          calculated_occupation_end?: string | null
          calculated_occupation_start?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: Database["public"]["Enums"]["app_role"] | null
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          driver_adjusted_end?: string | null
          driver_adjusted_start?: string | null
          driver_id?: string | null
          effective_end?: string | null
          effective_start?: string | null
          end_datetime?: string
          event_kind?: Database["public"]["Enums"]["event_kind"]
          event_kind_key?: string | null
          event_kind_label_snapshot?: string | null
          id?: string
          justification?: string | null
          notes?: string | null
          origin?: string | null
          origin_city_id?: string | null
          original_driver_id?: string | null
          override_conflict?: boolean
          reassign_overridden?: boolean
          reassign_reason?: string | null
          reassign_timeoff_id?: string | null
          reassigned_at?: string | null
          round_trip?: boolean
          series_id?: string | null
          series_index?: number | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["activity_status"]
          tag_id?: string | null
          title?: string
          travel_unknown?: boolean
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_adjustment_reason_id_fkey"
            columns: ["adjustment_reason_id"]
            isOneToOne: false
            referencedRelation: "travel_adjust_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_administrator_id_fkey"
            columns: ["administrator_id"]
            isOneToOne: false
            referencedRelation: "administrators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_origin_city_id_fkey"
            columns: ["origin_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_original_driver_id_fkey"
            columns: ["original_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_reassign_timeoff_id_fkey"
            columns: ["reassign_timeoff_id"]
            isOneToOne: false
            referencedRelation: "time_off"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "activity_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "event_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_change_validations: {
        Row: {
          activity_id: string
          changed_at: string
          changed_by: string | null
          changes: Json
          created_at: string
          decided_at: string | null
          decided_by: string | null
          driver_id: string | null
          event_start: string
          event_title: string
          id: string
          new_values: Json
          old_values: Json
          status: Database["public"]["Enums"]["validation_status"]
          updated_at: string
        }
        Insert: {
          activity_id: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          driver_id?: string | null
          event_start: string
          event_title: string
          id?: string
          new_values?: Json
          old_values?: Json
          status?: Database["public"]["Enums"]["validation_status"]
          updated_at?: string
        }
        Update: {
          activity_id?: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          driver_id?: string | null
          event_start?: string
          event_title?: string
          id?: string
          new_values?: Json
          old_values?: Json
          status?: Database["public"]["Enums"]["validation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_change_validations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_change_validations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_confidential_content: {
        Row: {
          activity_id: string
          created_at: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      activity_private_notes: {
        Row: {
          activity_id: string
          author_id: string | null
          author_role: Database["public"]["Enums"]["app_role"]
          body: string
          created_at: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          author_id?: string | null
          author_role: Database["public"]["Enums"]["app_role"]
          body: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          author_id?: string | null
          author_role?: Database["public"]["Enums"]["app_role"]
          body?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_private_notes_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_series: {
        Row: {
          active: boolean
          administrator_id: string
          assistant_id: string | null
          city_id: string | null
          created_at: string
          created_by: string | null
          event_kind_key: string | null
          event_kind_label_snapshot: string | null
          first_end: string
          first_start: string
          frequency: Database["public"]["Enums"]["recurrence_freq"]
          id: string
          materialized_until: string | null
          notes: string | null
          origin_city_id: string | null
          parent_series_id: string | null
          round_trip: boolean
          tag_id: string | null
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          until_date: string | null
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          active?: boolean
          administrator_id: string
          assistant_id?: string | null
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          event_kind_key?: string | null
          event_kind_label_snapshot?: string | null
          first_end: string
          first_start: string
          frequency: Database["public"]["Enums"]["recurrence_freq"]
          id?: string
          materialized_until?: string | null
          notes?: string | null
          origin_city_id?: string | null
          parent_series_id?: string | null
          round_trip?: boolean
          tag_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["activity_type"]
          until_date?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          active?: boolean
          administrator_id?: string
          assistant_id?: string | null
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          event_kind_key?: string | null
          event_kind_label_snapshot?: string | null
          first_end?: string
          first_start?: string
          frequency?: Database["public"]["Enums"]["recurrence_freq"]
          id?: string
          materialized_until?: string | null
          notes?: string | null
          origin_city_id?: string | null
          parent_series_id?: string | null
          round_trip?: boolean
          tag_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          until_date?: string | null
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_series_administrator_id_fkey"
            columns: ["administrator_id"]
            isOneToOne: false
            referencedRelation: "administrators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_series_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_series_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_series_origin_city_id_fkey"
            columns: ["origin_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_series_parent_series_id_fkey"
            columns: ["parent_series_id"]
            isOneToOne: false
            referencedRelation: "activity_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_series_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "event_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_series_confidential_content: {
        Row: {
          created_at: string
          notes: string | null
          series_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          series_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          series_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      activity_series_skips: {
        Row: {
          created_at: string
          series_id: string
          series_index: number
        }
        Insert: {
          created_at?: string
          series_id: string
          series_index: number
        }
        Update: {
          created_at?: string
          series_id?: string
          series_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_series_skips_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "activity_series"
            referencedColumns: ["id"]
          },
        ]
      }
      administrator_driver_priorities: {
        Row: {
          active: boolean
          administrator_id: string
          created_at: string
          driver_id: string
          id: string
          priority: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          administrator_id: string
          created_at?: string
          driver_id: string
          id?: string
          priority: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          administrator_id?: string
          created_at?: string
          driver_id?: string
          id?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "administrator_driver_priorities_administrator_id_fkey"
            columns: ["administrator_id"]
            isOneToOne: false
            referencedRelation: "administrators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrator_driver_priorities_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      administrators: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_dashboards: {
        Row: {
          created_at: string
          description: string | null
          global_filters: Json
          id: string
          is_default: boolean
          name: string
          owner_user_id: string
          shared_with_managers: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          global_filters?: Json
          id?: string
          is_default?: boolean
          name: string
          owner_user_id: string
          shared_with_managers?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          global_filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          owner_user_id?: string
          shared_with_managers?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      analytics_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          dimension_key: string | null
          filters: Json
          follows_global_filters: boolean
          grid_h: number
          grid_w: number
          grid_x: number
          grid_y: number
          id: string
          metric_key: string
          sort_order: number
          title: string
          updated_at: string
          visualization: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dashboard_id: string
          dimension_key?: string | null
          filters?: Json
          follows_global_filters?: boolean
          grid_h?: number
          grid_w?: number
          grid_x?: number
          grid_y?: number
          id?: string
          metric_key: string
          sort_order?: number
          title: string
          updated_at?: string
          visualization: string
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard_id?: string
          dimension_key?: string | null
          filters?: Json
          follows_global_filters?: boolean
          grid_h?: number
          grid_w?: number
          grid_x?: number
          grid_y?: number
          id?: string
          metric_key?: string
          sort_order?: number
          title?: string
          updated_at?: string
          visualization?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "analytics_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          assistants_can_approve_timeoff: boolean
          assistants_can_override_conflicts: boolean
          conditional_margin_minutes: number
          id: boolean
          updated_at: string
        }
        Insert: {
          assistants_can_approve_timeoff?: boolean
          assistants_can_override_conflicts?: boolean
          conditional_margin_minutes?: number
          id?: boolean
          updated_at?: string
        }
        Update: {
          assistants_can_approve_timeoff?: boolean
          assistants_can_override_conflicts?: boolean
          conditional_margin_minutes?: number
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      assistant_administrators: {
        Row: {
          active: boolean
          administrator_id: string
          assistant_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          delegation_state: string
          end_date: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          relationship_type: Database["public"]["Enums"]["admin_link_type"]
          share_future: boolean
          share_past: boolean
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          administrator_id: string
          assistant_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          delegation_state?: string
          end_date?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          relationship_type?: Database["public"]["Enums"]["admin_link_type"]
          share_future?: boolean
          share_past?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          administrator_id?: string
          assistant_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          delegation_state?: string
          end_date?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          relationship_type?: Database["public"]["Enums"]["admin_link_type"]
          share_future?: boolean
          share_past?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_administrators_administrator_id_fkey"
            columns: ["administrator_id"]
            isOneToOne: false
            referencedRelation: "administrators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_administrators_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_delegations: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          delegate_assistant_id: string
          delegation_type: Database["public"]["Enums"]["delegation_type"]
          driver_id: string
          end_datetime: string
          id: string
          original_assistant_id: string | null
          share_history: boolean
          start_datetime: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          delegate_assistant_id: string
          delegation_type?: Database["public"]["Enums"]["delegation_type"]
          driver_id: string
          end_datetime: string
          id?: string
          original_assistant_id?: string | null
          share_history?: boolean
          start_datetime: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          delegate_assistant_id?: string
          delegation_type?: Database["public"]["Enums"]["delegation_type"]
          driver_id?: string
          end_datetime?: string
          id?: string
          original_assistant_id?: string | null
          share_history?: boolean
          start_datetime?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_delegations_delegate_assistant_id_fkey"
            columns: ["delegate_assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_delegations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_delegations_original_assistant_id_fkey"
            columns: ["original_assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_driver_assignments: {
        Row: {
          active: boolean
          assistant_id: string
          created_at: string
          driver_id: string
          id: string
          priority: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          assistant_id: string
          created_at?: string
          driver_id: string
          id?: string
          priority: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          assistant_id?: string
          created_at?: string
          driver_id?: string
          id?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_driver_assignments_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      assistants: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      cities: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_base: boolean
          is_system: boolean
          name: string
          outbound_minutes: number
          return_minutes: number
          travel_configured: boolean
          travel_minutes: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_base?: boolean
          is_system?: boolean
          name: string
          outbound_minutes?: number
          return_minutes?: number
          travel_configured?: boolean
          travel_minutes?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_base?: boolean
          is_system?: boolean
          name?: string
          outbound_minutes?: number
          return_minutes?: number
          travel_configured?: boolean
          travel_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          active: boolean
          assistant_id: string | null
          can_create_events: boolean
          color_index: number | null
          created_at: string
          employee_code: string | null
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          assistant_id?: string | null
          can_create_events?: boolean
          color_index?: number | null
          created_at?: string
          employee_code?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          assistant_id?: string | null
          can_create_events?: boolean
          color_index?: number | null
          created_at?: string
          employee_code?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          payload: Json
          processed_at: string | null
          recipient_email: string
          recipient_user_id: string | null
          status: string
          subject: string
          template: string
        }
        Insert: {
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          status?: string
          subject: string
          template: string
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          status?: string
          subject?: string
          template?: string
        }
        Relationships: []
      }
      event_kind_tags: {
        Row: {
          active: boolean
          created_at: string
          is_core: boolean
          kind: string
          label: string
          requires_approval: boolean
          sort_order: number
          tag_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          is_core?: boolean
          kind: string
          label: string
          requires_approval?: boolean
          sort_order?: number
          tag_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          is_core?: boolean
          kind?: string
          label?: string
          requires_approval?: boolean
          sort_order?: number
          tag_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_kind_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "event_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tags: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_core: boolean
          label: string
          sort_order: number
          system_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_core?: boolean
          label: string
          sort_order?: number
          system_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_core?: boolean
          label?: string
          sort_order?: number
          system_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      loan_vehicle_event_types: {
        Row: {
          active: boolean
          allows_overlap_with_permanent: boolean
          allows_permanent: boolean
          color_key: string
          created_at: string
          default_end_time: string
          default_start_time: string
          id: string
          key: string
          label: string
          pattern: string
          requires_person: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allows_overlap_with_permanent?: boolean
          allows_permanent?: boolean
          color_key?: string
          created_at?: string
          default_end_time?: string
          default_start_time?: string
          id?: string
          key: string
          label: string
          pattern?: string
          requires_person?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allows_overlap_with_permanent?: boolean
          allows_permanent?: boolean
          color_key?: string
          created_at?: string
          default_end_time?: string
          default_start_time?: string
          id?: string
          key?: string
          label?: string
          pattern?: string
          requires_person?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      loan_vehicle_events: {
        Row: {
          cancel_reason: string | null
          cancelled: boolean
          created_at: string
          created_by: string | null
          end_datetime: string
          id: string
          kind: string
          kind_color_snapshot: string | null
          kind_label_snapshot: string | null
          kind_pattern_snapshot: string | null
          notes: string | null
          permanent: boolean
          person_name: string | null
          start_datetime: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled?: boolean
          created_at?: string
          created_by?: string | null
          end_datetime: string
          id?: string
          kind?: string
          kind_color_snapshot?: string | null
          kind_label_snapshot?: string | null
          kind_pattern_snapshot?: string | null
          notes?: string | null
          permanent?: boolean
          person_name?: string | null
          start_datetime: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled?: boolean
          created_at?: string
          created_by?: string | null
          end_datetime?: string
          id?: string
          kind?: string
          kind_color_snapshot?: string | null
          kind_label_snapshot?: string | null
          kind_pattern_snapshot?: string | null
          notes?: string | null
          permanent?: boolean
          person_name?: string | null
          start_datetime?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_vehicle_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "loan_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_vehicles: {
        Row: {
          active: boolean
          brand: string | null
          created_at: string
          created_by: string | null
          id: string
          model: string | null
          plate: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          plate: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          plate?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_releases: {
        Row: {
          activity_id: string | null
          administrator_id: string | null
          created_at: string
          created_by: string | null
          driver_id: string | null
          end_datetime: string
          id: string
          notes: string | null
          start_datetime: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_id?: string | null
          administrator_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          end_datetime: string
          id?: string
          notes?: string | null
          start_datetime: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_id?: string | null
          administrator_id?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          end_datetime?: string
          id?: string
          notes?: string | null
          start_datetime?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_releases_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_releases_administrator_id_fkey"
            columns: ["administrator_id"]
            isOneToOne: false
            referencedRelation: "administrators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_releases_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off: {
        Row: {
          approved_by: string | null
          created_at: string
          driver_id: string
          end_date: string
          id: string
          notes: string | null
          reason: string | null
          requested_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["timeoff_status"]
          tag_id: string | null
          type: Database["public"]["Enums"]["timeoff_type"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          driver_id: string
          end_date: string
          id?: string
          notes?: string | null
          reason?: string | null
          requested_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["timeoff_status"]
          tag_id?: string | null
          type?: Database["public"]["Enums"]["timeoff_type"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          driver_id?: string
          end_date?: string
          id?: string
          notes?: string | null
          reason?: string | null
          requested_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["timeoff_status"]
          tag_id?: string | null
          type?: Database["public"]["Enums"]["timeoff_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "event_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_adjust_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_core: boolean
          label: string
          requires_approval: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_core?: boolean
          label: string
          requires_approval?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_core?: boolean
          label?: string
          requires_approval?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      travel_routes: {
        Row: {
          created_at: string
          id: string
          key_a: string
          key_b: string
          minutes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_a: string
          key_b: string
          minutes: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_a?: string
          key_b?: string
          minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      unavailability: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string
          end_datetime: string
          id: string
          notes: string | null
          reason: string | null
          start_datetime: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id: string
          end_datetime: string
          id?: string
          notes?: string | null
          reason?: string | null
          start_datetime: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string
          end_datetime?: string
          id?: string
          notes?: string | null
          reason?: string | null
          start_datetime?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_activity_occupation: {
        Args: {
          _end: string
          _id: string
          _justification?: string
          _reason_id: string
          _scope?: string
          _start: string
        }
        Returns: number
      }
      analytics_occupancy: {
        Args: {
          _administrator_ids?: string[]
          _assistant_ids?: string[]
          _driver_ids?: string[]
          _from: string
          _tag_ids?: string[]
          _to: string
        }
        Returns: {
          capacity_minutes: number
          driver_id: string
          driver_name: string
          hour_data: Json
          occupied_minutes: number
        }[]
      }
      assign_service_driver: {
        Args: {
          _driver_id: string
          _expected_updated_at: string
          _id: string
          _override: boolean
        }
        Returns: undefined
      }
      assistant_serves_administrator: {
        Args: { _administrator_id: string; _assistant_id: string }
        Returns: boolean
      }
      audit: {
        Args: {
          _action: string
          _eid: string
          _etype: string
          _new: Json
          _old: Json
        }
        Returns: undefined
      }
      can_edit_activities: { Args: never; Returns: boolean }
      can_manage_driver_schedule: {
        Args: { _driver_id: string }
        Returns: boolean
      }
      can_own_release: {
        Args: { _administrator_id: string; _driver_id: string }
        Returns: boolean
      }
      can_release_driver_schedule: {
        Args: { _driver_id: string }
        Returns: boolean
      }
      can_resolve_assignments: { Args: never; Returns: boolean }
      can_view_activity:
        | {
            Args: {
              _administrator_id: string
              _assistant_id: string
              _driver_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _administrator_id: string
              _assistant_id: string
              _driver_id: string
              _start: string
            }
            Returns: boolean
          }
      can_view_driver: { Args: { _driver_id: string }; Returns: boolean }
      can_view_driver_details: {
        Args: { _driver_id: string }
        Returns: boolean
      }
      can_view_private_note: {
        Args: { _activity_id: string }
        Returns: boolean
      }
      cancel_activity: {
        Args: { _id: string; _reason?: string }
        Returns: undefined
      }
      cancel_service_auto: { Args: { _id: string }; Returns: undefined }
      cancel_service_series: {
        Args: { _id: string; _scope: string }
        Returns: number
      }
      city_travel_key: { Args: { _city_id: string }; Returns: string }
      create_city_pending: { Args: { _name: string }; Returns: string }
      create_driver_garage_event:
        | {
            Args: {
              _city_id: string
              _end: string
              _notes: string
              _start: string
              _title: string
            }
            Returns: string
          }
        | {
            Args: {
              _city_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _start: string
              _title: string
            }
            Returns: string
          }
      create_driver_service:
        | {
            Args: {
              _administrator_id: string
              _end: string
              _notes: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
      create_garage_event:
        | {
            Args: {
              _city_id: string
              _driver_id: string
              _end: string
              _notes: string
              _override: boolean
              _start: string
              _title: string
            }
            Returns: string
          }
        | {
            Args: {
              _city_id: string
              _driver_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _override: boolean
              _start: string
              _title: string
            }
            Returns: string
          }
        | {
            Args: {
              _city_id: string
              _driver_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _override: boolean
              _round_trip: boolean
              _start: string
              _title: string
            }
            Returns: string
          }
        | {
            Args: {
              _driver_id: string
              _end: string
              _notes: string
              _override: boolean
              _start: string
              _title: string
            }
            Returns: string
          }
      create_service_auto:
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _notes: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _event_kind_key: string
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: string
          }
      create_service_series:
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _freq: Database["public"]["Enums"]["recurrence_freq"]
              _notes: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
              _until: string
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _freq: Database["public"]["Enums"]["recurrence_freq"]
              _notes: string
              _origin_city_id: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
              _until: string
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _freq: Database["public"]["Enums"]["recurrence_freq"]
              _notes: string
              _origin_city_id: string
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
              _until: string
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _freq: Database["public"]["Enums"]["recurrence_freq"]
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
              _until: string
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _event_kind_key: string
              _freq: Database["public"]["Enums"]["recurrence_freq"]
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
              _until: string
            }
            Returns: string
          }
        | {
            Args: {
              _administrator_id: string
              _city_id: string
              _end: string
              _event_kind_key: string
              _freq: Database["public"]["Enums"]["recurrence_freq"]
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
              _until: string
              _weekdays: number[]
            }
            Returns: string
          }
      decide_activity_change: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      decide_event_approval: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: undefined
      }
      decide_occupation_adjustment: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      delegate_administrator: {
        Args: {
          _administrator_id: string
          _delegate_assistant_id: string
          _end_date: string
          _share_future?: boolean
          _share_past?: boolean
          _start_date: string
        }
        Returns: string
      }
      display_names: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      driver_audience: {
        Args: { _driver_id: string }
        Returns: {
          user_id: string
        }[]
      }
      driver_can_create_events: {
        Args: { _driver_id: string }
        Returns: boolean
      }
      driver_is_available:
        | {
            Args: {
              _driver_id: string
              _end: string
              _ignore_activity: string
              _start: string
            }
            Returns: string
          }
        | {
            Args: {
              _driver_id: string
              _end: string
              _ignore_activity: string
              _ignore_timeoff: string
              _start: string
            }
            Returns: string
          }
      driver_is_conditional: {
        Args: {
          _driver_id: string
          _end: string
          _ignore_activity: string
          _start: string
        }
        Returns: boolean
      }
      driver_monthly_worked_minutes: {
        Args: { _month: string }
        Returns: {
          driver_id: string
          worked_minutes: number
        }[]
      }
      end_administrator_delegation: {
        Args: { _id: string }
        Returns: undefined
      }
      ensure_series_range: {
        Args: { _from: string; _to: string }
        Returns: number
      }
      extend_open_series: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_view: { Args: never; Returns: boolean }
      is_administrator: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_privileged_user: { Args: { _uid: string }; Returns: boolean }
      is_released: {
        Args: { _driver_id: string; _end: string; _start: string }
        Returns: boolean
      }
      materialize_series: {
        Args: { _from: string; _series_id: string; _to: string }
        Returns: number
      }
      my_administrator_id: { Args: never; Returns: string }
      my_assistant_id: { Args: never; Returns: string }
      my_driver_can_create_events: { Args: never; Returns: boolean }
      my_driver_id: { Args: never; Returns: string }
      my_releasable_driver_ids: { Args: never; Returns: string[] }
      notify: {
        Args: {
          _body: string
          _eid: string
          _etype: string
          _kind: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      notify_pending_assignment: {
        Args: { _activity_id: string }
        Returns: undefined
      }
      occupation_window:
        | {
            Args: {
              _city_id: string
              _end: string
              _round_trip: boolean
              _start: string
            }
            Returns: Record<string, unknown>
          }
        | {
            Args: { _city_id: string; _end: string; _start: string }
            Returns: Record<string, unknown>
          }
        | {
            Args: {
              _city_id: string
              _end: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
            }
            Returns: Record<string, unknown>
          }
      pick_driver_by_priority: {
        Args: {
          _administrator_id: string
          _ignore_activity: string
          _occ_end: string
          _occ_start: string
          _prefer: string
        }
        Returns: Record<string, unknown>
      }
      released_minutes: {
        Args: { _driver_id: string; _end: string; _start: string }
        Returns: number
      }
      require_active_service_tag: {
        Args: { _tag_id: string }
        Returns: {
          active: boolean
          created_at: string
          id: string
          is_core: boolean
          label: string
          sort_order: number
          system_key: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "event_tags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_administrator_delegation: {
        Args: { _accept: boolean; _id: string }
        Returns: undefined
      }
      route_display_label: {
        Args: { _dest_city_id: string; _origin_city_id: string }
        Returns: string
      }
      route_travel_minutes: {
        Args: { _dest_city_id: string; _origin_city_id: string }
        Returns: number
      }
      series_horizon: { Args: never; Returns: string }
      series_occurrences: {
        Args: { _from: string; _series_id: string; _to: string }
        Returns: {
          idx: number
          occ_start: string
        }[]
      }
      series_shift: {
        Args: {
          _freq: Database["public"]["Enums"]["recurrence_freq"]
          _n: number
          _ts: string
        }
        Returns: string
      }
      serves_administrator: {
        Args: { _administrator_id: string }
        Returns: boolean
      }
      set_activity_series_tag: {
        Args: { _series_id: string; _tag_id: string }
        Returns: undefined
      }
      set_activity_tag: {
        Args: { _activity_id: string; _tag_id: string }
        Returns: undefined
      }
      set_administrator_priorities: {
        Args: { _administrator_id: string; _driver_ids: string[] }
        Returns: undefined
      }
      set_event_justification: {
        Args: { _id: string; _justification: string }
        Returns: undefined
      }
      timeoff_apply_reassignment: {
        Args: {
          _active: boolean
          _driver_id: string
          _end: string
          _start: string
          _timeoff_id: string
        }
        Returns: Json
      }
      timeoff_last_summary: { Args: { _timeoff_id: string }; Returns: Json }
      update_service_auto:
        | {
            Args: {
              _city_id: string
              _end: string
              _expected_updated_at: string
              _id: string
              _notes: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: undefined
          }
        | {
            Args: {
              _city_id: string
              _end: string
              _expected_updated_at: string
              _id: string
              _notes: string
              _origin_city_id: string
              _start: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: undefined
          }
        | {
            Args: {
              _city_id: string
              _end: string
              _expected_updated_at: string
              _id: string
              _notes: string
              _origin_city_id: string
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: undefined
          }
        | {
            Args: {
              _city_id: string
              _end: string
              _expected_updated_at: string
              _id: string
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: undefined
          }
        | {
            Args: {
              _city_id: string
              _end: string
              _event_kind_key: string
              _expected_updated_at: string
              _id: string
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _start: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: undefined
          }
      update_service_series:
        | {
            Args: {
              _city_id: string
              _duration_minutes: number
              _id: string
              _notes: string
              _scope: string
              _start_time: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: number
          }
        | {
            Args: {
              _city_id: string
              _duration_minutes: number
              _id: string
              _notes: string
              _origin_city_id: string
              _scope: string
              _start_time: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: number
          }
        | {
            Args: {
              _city_id: string
              _duration_minutes: number
              _id: string
              _notes: string
              _origin_city_id: string
              _scope: string
              _start_time: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: number
          }
        | {
            Args: {
              _city_id: string
              _duration_minutes: number
              _id: string
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _scope: string
              _start_time: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: number
          }
        | {
            Args: {
              _city_id: string
              _duration_minutes: number
              _event_kind_key: string
              _id: string
              _notes: string
              _origin_city_id: string
              _round_trip: boolean
              _scope: string
              _start_time: string
              _tag_id: string
              _title: string
              _type: Database["public"]["Enums"]["activity_type"]
            }
            Returns: number
          }
      update_service_series_rows: {
        Args: {
          _city_id: string
          _duration_minutes: number
          _id: string
          _notes: string
          _origin_city_id: string
          _round_trip: boolean
          _scope: string
          _start_time: string
          _tag_id: string
          _title: string
          _type: Database["public"]["Enums"]["activity_type"]
        }
        Returns: number
      }
      validation_field_label: { Args: { _field: string }; Returns: string }
      validation_value_label: {
        Args: { _field: string; _value: Json }
        Returns: string
      }
    }
    Enums: {
      activity_status: "draft" | "confirmed" | "cancelled"
      activity_type:
        | "trip"
        | "airport"
        | "meeting"
        | "event"
        | "service"
        | "availability"
        | "other"
      admin_link_type: "primary" | "delegated"
      app_role: "manager" | "assistant" | "driver" | "owner" | "administrator"
      assignment_status: "automatic" | "manual" | "pending_manual"
      delegation_type: "assistant" | "owner_limited"
      event_kind: "administration" | "garage"
      recurrence_freq: "daily" | "weekly" | "monthly" | "yearly"
      timeoff_status: "pending" | "approved" | "rejected" | "cancelled"
      timeoff_type: "holiday" | "sick" | "personal" | "other"
      validation_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_status: ["draft", "confirmed", "cancelled"],
      activity_type: [
        "trip",
        "airport",
        "meeting",
        "event",
        "service",
        "availability",
        "other",
      ],
      admin_link_type: ["primary", "delegated"],
      app_role: ["manager", "assistant", "driver", "owner", "administrator"],
      assignment_status: ["automatic", "manual", "pending_manual"],
      delegation_type: ["assistant", "owner_limited"],
      event_kind: ["administration", "garage"],
      recurrence_freq: ["daily", "weekly", "monthly", "yearly"],
      timeoff_status: ["pending", "approved", "rejected", "cancelled"],
      timeoff_type: ["holiday", "sick", "personal", "other"],
      validation_status: ["pending", "approved", "rejected"],
    },
  },
} as const
