export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organisations: {
        Row: {
          id: string;
          name: string;
          trading_name: string | null;
          legal_name: string | null;
          business_type: string | null;
          primary_trade: string | null;
          company_size: string | null;
          quoting_volume: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          city: string | null;
          region: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          trading_name?: string | null;
          legal_name?: string | null;
          business_type?: string | null;
          primary_trade?: string | null;
          company_size?: string | null;
          quoting_volume?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          city?: string | null;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          trading_name?: string | null;
          legal_name?: string | null;
          business_type?: string | null;
          primary_trade?: string | null;
          company_size?: string | null;
          quoting_volume?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          city?: string | null;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          organisation_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          phone: string | null;
          job_title: string | null;
          organisation_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          phone?: string | null;
          job_title?: string | null;
          organisation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          phone?: string | null;
          job_title?: string | null;
          organisation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          organisation_id: string;
          created_by: string;
          client_id: string | null;
          title: string;
          site_address: string;
          enquiry_source: string;
          enquiry_status: string;
          client_brief: string | null;
          priority: string;
          status: string;
          job_type: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          created_by: string;
          client_id?: string | null;
          title: string;
          site_address: string;
          enquiry_source: string;
          enquiry_status?: string;
          client_brief?: string | null;
          priority?: string;
          status?: string;
          job_type?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          created_by?: string;
          client_id?: string | null;
          title?: string;
          site_address?: string;
          enquiry_source?: string;
          enquiry_status?: string;
          client_brief?: string | null;
          priority?: string;
          status?: string;
          job_type?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      scope_types: {
        Row: {
          id: string;
          organisation_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      project_scopes: {
        Row: {
          id: string;
          job_id: string;
          organisation_id: string;
          scope_type_id: string | null;
          name: string;
          description: string | null;
          location_area: string | null;
          status: string;
          ai_status: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          organisation_id: string;
          scope_type_id?: string | null;
          name: string;
          description?: string | null;
          location_area?: string | null;
          status?: string;
          ai_status?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          organisation_id?: string;
          scope_type_id?: string | null;
          name?: string;
          description?: string | null;
          location_area?: string | null;
          status?: string;
          ai_status?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_scopes_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_scopes_scope_type_id_fkey";
            columns: ["scope_type_id"];
            isOneToOne: false;
            referencedRelation: "scope_types";
            referencedColumns: ["id"];
          },
        ];
      };
      scope_measurements: {
        Row: {
          id: string;
          project_scope_id: string;
          label: string;
          value: string;
          unit: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_scope_id: string;
          label: string;
          value: string;
          unit?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_scope_id?: string;
          label?: string;
          value?: string;
          unit?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scope_measurements_project_scope_id_fkey";
            columns: ["project_scope_id"];
            isOneToOne: false;
            referencedRelation: "project_scopes";
            referencedColumns: ["id"];
          },
        ];
      };
      scope_photos: {
        Row: {
          id: string;
          project_scope_id: string;
          storage_path: string;
          file_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_scope_id: string;
          storage_path: string;
          file_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_scope_id?: string;
          storage_path?: string;
          file_name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scope_photos_project_scope_id_fkey";
            columns: ["project_scope_id"];
            isOneToOne: false;
            referencedRelation: "project_scopes";
            referencedColumns: ["id"];
          },
        ];
      };
      scope_documents: {
        Row: {
          id: string;
          project_scope_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_scope_id: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_scope_id?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scope_documents_project_scope_id_fkey";
            columns: ["project_scope_id"];
            isOneToOne: false;
            referencedRelation: "project_scopes";
            referencedColumns: ["id"];
          },
        ];
      };
      scope_questions: {
        Row: {
          id: string;
          project_scope_id: string;
          question: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_scope_id: string;
          question: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_scope_id?: string;
          question?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      scope_answers: {
        Row: {
          id: string;
          scope_question_id: string;
          project_scope_id: string;
          answer: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scope_question_id: string;
          project_scope_id: string;
          answer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scope_question_id?: string;
          project_scope_id?: string;
          answer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rfq_packages: {
        Row: {
          id: string;
          organisation_id: string;
          project_scope_id: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_scope_id?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_scope_id?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      site_visits: {
        Row: {
          id: string;
          organisation_id: string;
          created_by: string;
          client_id: string | null;
          title: string;
          client_name: string;
          client_phone: string | null;
          site_address: string;
          job_type: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          created_by: string;
          client_id?: string | null;
          title: string;
          client_name: string;
          client_phone?: string | null;
          site_address: string;
          job_type: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          created_by?: string;
          client_id?: string | null;
          title?: string;
          client_name?: string;
          client_phone?: string | null;
          site_address?: string;
          job_type?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_visits_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_visits_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      site_visit_measurements: {
        Row: {
          id: string;
          site_visit_id: string;
          label: string;
          value: string;
          unit: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_visit_id: string;
          label: string;
          value: string;
          unit?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_visit_id?: string;
          label?: string;
          value?: string;
          unit?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_visit_measurements_site_visit_id_fkey";
            columns: ["site_visit_id"];
            isOneToOne: false;
            referencedRelation: "site_visits";
            referencedColumns: ["id"];
          },
        ];
      };
      site_visit_photos: {
        Row: {
          id: string;
          site_visit_id: string;
          storage_path: string;
          file_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          site_visit_id: string;
          storage_path: string;
          file_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_visit_id?: string;
          storage_path?: string;
          file_name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_visit_photos_site_visit_id_fkey";
            columns: ["site_visit_id"];
            isOneToOne: false;
            referencedRelation: "site_visits";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_organisation_for_user: {
        Args: {
          org_name: string;
          org_trading_name: string;
          org_legal_name?: string | null;
          org_business_type: string;
          org_primary_trade: string;
          org_company_size: string;
          org_quoting_volume: string;
          org_phone: string;
          org_email: string;
          org_website?: string | null;
          org_city: string;
          org_region: string;
        };
        Returns: string;
      };
      get_user_organisation_id: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Organisation = Database["public"]["Tables"]["organisations"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Job = Database["public"]["Tables"]["jobs"]["Row"];
/** UI-facing alias — stored in the `jobs` table. */
export type Project = Job;
export type ScopeType = Database["public"]["Tables"]["scope_types"]["Row"];
export type ProjectScope = Database["public"]["Tables"]["project_scopes"]["Row"];
export type ScopeMeasurement =
  Database["public"]["Tables"]["scope_measurements"]["Row"];
export type ScopePhoto = Database["public"]["Tables"]["scope_photos"]["Row"];
export type ScopeDocument =
  Database["public"]["Tables"]["scope_documents"]["Row"];
export type SiteVisit = Database["public"]["Tables"]["site_visits"]["Row"];
export type SiteVisitMeasurement =
  Database["public"]["Tables"]["site_visit_measurements"]["Row"];
export type SiteVisitPhoto =
  Database["public"]["Tables"]["site_visit_photos"]["Row"];

export type SiteVisitWithRelations = SiteVisit & {
  site_visit_measurements: SiteVisitMeasurement[];
  site_visit_photos: SiteVisitPhoto[];
};
