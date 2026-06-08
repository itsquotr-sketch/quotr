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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          name: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          name?: string;
          phone?: string | null;
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
          full_name: string | null;
          organisation_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          organisation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
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
        Args: { org_name: string };
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
export type SiteVisit = Database["public"]["Tables"]["site_visits"]["Row"];
export type SiteVisitMeasurement =
  Database["public"]["Tables"]["site_visit_measurements"]["Row"];
export type SiteVisitPhoto =
  Database["public"]["Tables"]["site_visit_photos"]["Row"];

export type SiteVisitWithRelations = SiteVisit & {
  site_visit_measurements: SiteVisitMeasurement[];
  site_visit_photos: SiteVisitPhoto[];
};
