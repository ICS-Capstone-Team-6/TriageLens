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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ambulance_requests: {
        Row: {
          answer_note: string
          answered_at: string | null
          answered_by: string | null
          created_at: string
          created_by: string
          eta_minutes: number | null
          from_facility: string
          id: string
          note: string
          reason: string
          referral_id: string
          seen_at: string | null
          status: string
          to_facility: string
        }
        Insert: {
          answer_note?: string
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          created_by: string
          eta_minutes?: number | null
          from_facility: string
          id: string
          note?: string
          reason: string
          referral_id: string
          seen_at?: string | null
          status?: string
          to_facility: string
        }
        Update: {
          answer_note?: string
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          created_by?: string
          eta_minutes?: number | null
          from_facility?: string
          id?: string
          note?: string
          reason?: string
          referral_id?: string
          seen_at?: string | null
          status?: string
          to_facility?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambulance_requests_from_facility_fkey"
            columns: ["from_facility"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulance_requests_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulance_requests_to_facility_fkey"
            columns: ["to_facility"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          entity: string
          entity_id: string
          id: string
          meta: Json
          occurred_at: string
        }
        Insert: {
          action: string
          actor?: string | null
          entity: string
          entity_id: string
          id?: string
          meta?: Json
          occurred_at?: string
        }
        Update: {
          action?: string
          actor?: string | null
          entity?: string
          entity_id?: string
          id?: string
          meta?: Json
          occurred_at?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          age_band: string
          client_version: number
          created_at: string
          created_by: string
          facility_id: string
          id: string
          notes: string
          sex: string | null
          status: string
          symptoms: Json
          updated_at: string
        }
        Insert: {
          age_band: string
          client_version: number
          created_at?: string
          created_by: string
          facility_id: string
          id: string
          notes?: string
          sex?: string | null
          status?: string
          symptoms?: Json
          updated_at?: string
        }
        Update: {
          age_band?: string
          client_version?: number
          created_at?: string
          created_by?: string
          facility_id?: string
          id?: string
          notes?: string
          sex?: string | null
          status?: string
          symptoms?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          created_at: string
          district: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          opening_hours: Json | null
          phone: string
          region: string
          services: string[]
          services_confirmed_at: string | null
        }
        Insert: {
          created_at?: string
          district?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          opening_hours?: Json | null
          phone?: string
          region?: string
          services?: string[]
          services_confirmed_at?: string | null
        }
        Update: {
          created_at?: string
          district?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          opening_hours?: Json | null
          phone?: string
          region?: string
          services?: string[]
          services_confirmed_at?: string | null
        }
        Relationships: []
      }
      facility_keys: {
        Row: {
          created_at: string
          created_by: string
          facility_id: string
          public_key: Json
          wrapped_private_key: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          facility_id: string
          public_key: Json
          wrapped_private_key: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          facility_id?: string
          public_key?: Json
          wrapped_private_key?: Json
        }
        Relationships: [
          {
            foreignKeyName: "facility_keys_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: true
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      inferences: {
        Row: {
          case_id: string
          created_at: string
          device_info: Json
          id: string
          latency_ms: number
          model_name: string
          model_version: string
          outputs: Json
          quality_scores: Json
          thresholds_version: string
          zone: string
        }
        Insert: {
          case_id: string
          created_at?: string
          device_info?: Json
          id: string
          latency_ms: number
          model_name: string
          model_version: string
          outputs: Json
          quality_scores: Json
          thresholds_version: string
          zone: string
        }
        Update: {
          case_id?: string
          created_at?: string
          device_info?: Json
          id?: string
          latency_ms?: number
          model_name?: string
          model_version?: string
          outputs?: Json
          quality_scores?: Json
          thresholds_version?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "inferences_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          disabled_at: string | null
          display_name: string
          facility_id: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          display_name?: string
          facility_id?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          display_name?: string
          facility_id?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_events: {
        Row: {
          actor: string | null
          id: string
          note: string
          occurred_at: string
          referral_id: string
          status: string
        }
        Insert: {
          actor?: string | null
          id?: string
          note?: string
          occurred_at?: string
          referral_id: string
          status: string
        }
        Update: {
          actor?: string | null
          id?: string
          note?: string
          occurred_at?: string
          referral_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_events_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_image_keys: {
        Row: {
          created_at: string
          facility_id: string
          referral_id: string
          wrapped_key: Json
        }
        Insert: {
          created_at?: string
          facility_id: string
          referral_id: string
          wrapped_key: Json
        }
        Update: {
          created_at?: string
          facility_id?: string
          referral_id?: string
          wrapped_key?: Json
        }
        Relationships: [
          {
            foreignKeyName: "referral_image_keys_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_image_keys_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          case_id: string
          code: string
          conditions: string[]
          created_at: string
          created_by: string
          distance_band: string | null
          expires_at: string
          from_facility: string
          heatmap_shared: boolean
          id: string
          image_consent: boolean
          image_consented_at: string | null
          image_shared: boolean
          initials: string
          outcome: string | null
          outcome_at: string | null
          rules_version: string
          status: string
          to_facility: string
          updated_at: string
          urgency: string | null
        }
        Insert: {
          case_id: string
          code: string
          conditions: string[]
          created_at?: string
          created_by: string
          distance_band?: string | null
          expires_at?: string
          from_facility: string
          heatmap_shared?: boolean
          id: string
          image_consent?: boolean
          image_consented_at?: string | null
          image_shared?: boolean
          initials?: string
          outcome?: string | null
          outcome_at?: string | null
          rules_version: string
          status?: string
          to_facility: string
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          case_id?: string
          code?: string
          conditions?: string[]
          created_at?: string
          created_by?: string
          distance_band?: string | null
          expires_at?: string
          from_facility?: string
          heatmap_shared?: boolean
          id?: string
          image_consent?: boolean
          image_consented_at?: string | null
          image_shared?: boolean
          initials?: string
          outcome?: string | null
          outcome_at?: string | null
          rules_version?: string
          status?: string
          to_facility?: string
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_from_facility_fkey"
            columns: ["from_facility"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_to_facility_fkey"
            columns: ["to_facility"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_referral: {
        Args: {
          p_id: string
          p_note?: string
          p_outcome?: string
          p_status: string
        }
        Returns: Json
      }
      answer_ambulance: {
        Args: {
          p_eta?: number
          p_id: string
          p_note?: string
          p_status: string
        }
        Returns: Json
      }
      append_inference: { Args: { p_inference: Json }; Returns: Json }
      cancel_ambulance: { Args: { p_id: string }; Returns: Json }
      confirm_image_upload: {
        Args: { p_id: string; p_keys: Json }
        Returns: Json
      }
      consent_image_share: { Args: { p_id: string }; Returns: Json }
      create_referral: { Args: { p_referral: Json }; Returns: Json }
      facility_public_keys: { Args: { p_ids: string[] }; Returns: Json }
      get_case: { Args: { p_case_id: string }; Returns: Json }
      get_referral: { Args: { p_id: string }; Returns: Json }
      list_ambulance_requests: {
        Args: { p_direction: string; p_limit?: number }
        Returns: Json
      }
      list_cases: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_referral_facilities: { Args: never; Returns: Json }
      list_referrals: {
        Args: { p_direction: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      lookup_referral: { Args: { p_code: string }; Returns: Json }
      my_facility: { Args: never; Returns: Json }
      my_role: { Args: never; Returns: Json }
      open_referral_image: { Args: { p_id: string }; Returns: Json }
      own_facility_key: { Args: never; Returns: Json }
      referral_images_due_for_deletion: { Args: never; Returns: string[] }
      referral_stats: { Args: { p_weeks?: number }; Returns: Json }
      request_ambulance: { Args: { p: Json }; Returns: Json }
      reset_facility_key: {
        Args: { p_facility_id: string }
        Returns: undefined
      }
      save_case: { Args: { p_case: Json }; Returns: Json }
      set_facility_key: {
        Args: { p_public: Json; p_wrapped: Json }
        Returns: Json
      }
      update_facility_services: {
        Args: {
          p_facility_id: string
          p_opening_hours?: Json
          p_phone?: string
          p_services: string[]
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

