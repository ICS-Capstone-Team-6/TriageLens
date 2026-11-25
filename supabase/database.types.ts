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
          id: string
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
          id: string
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
          id?: string
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
      append_inference: { Args: { p_inference: Json }; Returns: Json }
      create_referral: { Args: { p_referral: Json }; Returns: Json }
      get_case: { Args: { p_case_id: string }; Returns: Json }
      get_referral: { Args: { p_id: string }; Returns: Json }
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
      save_case: { Args: { p_case: Json }; Returns: Json }
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

