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
      approval_history: {
        Row: {
          action: string
          approver_id: string
          comment: string | null
          created_at: string
          document_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          action: string
          approver_id: string
          comment?: string | null
          created_at?: string
          document_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          action?: string
          approver_id?: string
          comment?: string | null
          created_at?: string
          document_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "approval_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      bundle_cache: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          doc_count: number
          id: string
          signature: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          doc_count?: number
          id?: string
          signature: string
          size_bytes?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          doc_count?: number
          id?: string
          signature?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_cache_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          hod_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          hod_id?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          hod_id?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      document_type_settings: {
        Row: {
          active: boolean
          document_type: Database["public"]["Enums"]["document_type"]
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          document_type: Database["public"]["Enums"]["document_type"]
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          document_type?: Database["public"]["Enums"]["document_type"]
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          academic_year: string | null
          class_name: string | null
          course: string | null
          created_at: string
          department_id: string | null
          description: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_path: string
          id: string
          is_current: boolean
          mime_type: string | null
          parent_document_id: string | null
          session: string | null
          status: Database["public"]["Enums"]["document_status"]
          subject: string | null
          term: string | null
          title: string
          trainer_id: string
          updated_at: string
          version_number: number
          week: string | null
        }
        Insert: {
          academic_year?: string | null
          class_name?: string | null
          course?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_path: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          parent_document_id?: string | null
          session?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          subject?: string | null
          term?: string | null
          title: string
          trainer_id: string
          updated_at?: string
          version_number?: number
          week?: string | null
        }
        Update: {
          academic_year?: string | null
          class_name?: string | null
          course?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_name?: string
          file_path?: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          parent_document_id?: string | null
          session?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          subject?: string | null
          term?: string | null
          title?: string
          trainer_id?: string
          updated_at?: string
          version_number?: number
          week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_images: {
        Row: {
          active: boolean
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_users: {
        Row: {
          created_at: string
          department_id: string | null
          email: string
          full_name: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email: string
          full_name?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_roles: Database["public"]["Enums"]["app_role"][] | null
          department_id: string | null
          email: string
          full_name: string
          id: string
          status: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_roles?: Database["public"]["Enums"]["app_role"][] | null
          department_id?: string | null
          email: string
          full_name?: string
          id: string
          status?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_roles?: Database["public"]["Enums"]["app_role"][] | null
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          status?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      report_permissions: {
        Row: {
          can_view_reports: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_view_reports?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_view_reports?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      submission_deadlines: {
        Row: {
          academic_year: string | null
          allow_late: boolean
          created_at: string
          created_by: string | null
          department_id: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          due_date: string
          id: string
          notes: string | null
          term: string | null
          updated_at: string
        }
        Insert: {
          academic_year?: string | null
          allow_late?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          due_date: string
          id?: string
          notes?: string | null
          term?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string | null
          allow_late?: boolean
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          due_date?: string
          id?: string
          notes?: string | null
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_deadlines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
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
      admin_exists: { Args: never; Returns: boolean }
      can_view_document: { Args: { _doc_id: string }; Returns: boolean }
      can_view_reports: { Args: { _user_id: string }; Returns: boolean }
      claim_first_admin: { Args: never; Returns: boolean }
      document_root_id: { Args: { _doc_id: string }; Returns: string }
      ensure_my_profile: {
        Args: never
        Returns: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_roles: Database["public"]["Enums"]["app_role"][] | null
          department_id: string | null
          email: string
          full_name: string
          id: string
          status: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_department: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: { _action: string; _details?: Json }
        Returns: undefined
      }
      notify_users: {
        Args: {
          _link?: string
          _message: string
          _title: string
          _user_ids: string[]
        }
        Returns: undefined
      }
      users_with_role_in_department: {
        Args: {
          _department_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string[]
      }
    }
    Enums: {
      app_role: "admin" | "trainer" | "hod" | "deputy_principal" | "iqa"
      document_status:
        | "pending_hod"
        | "rejected_hod"
        | "pending_iqa"
        | "rejected_iqa"
        | "pending_dp"
        | "rejected_dp"
        | "approved"
      document_type:
        | "scheme_of_work"
        | "session_plan"
        | "record_of_work"
        | "training_program"
        | "learning_plan"
        | "lesson_notes"
        | "assessment_document"
        | "iqa_document"
        | "other"
        | "course_outline"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "trainer", "hod", "deputy_principal", "iqa"],
      document_status: [
        "pending_hod",
        "rejected_hod",
        "pending_iqa",
        "rejected_iqa",
        "pending_dp",
        "rejected_dp",
        "approved",
      ],
      document_type: [
        "scheme_of_work",
        "session_plan",
        "record_of_work",
        "training_program",
        "learning_plan",
        "lesson_notes",
        "assessment_document",
        "iqa_document",
        "other",
        "course_outline",
      ],
    },
  },
} as const
