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
      assistant_messages: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          role: string;
          content: string;
          metadata: Json;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          role: string;
          content: string;
          metadata?: Json;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          role?: string;
          content?: string;
          metadata?: Json;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_messages_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assistant_messages_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assistant_messages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
      projects: {
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
            foreignKeyName: "projects_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_organisation_id_fkey";
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
      project_scope_builder_inputs: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          input_type: string;
          content: string;
          status: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          input_type: string;
          content: string;
          status?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          input_type?: string;
          content?: string;
          status?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_scope_builder_inputs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_scope_builder_inputs_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      project_scope_suggestions: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          source_input_id: string | null;
          suggested_scope_type: string;
          suggested_name: string;
          suggested_description: string | null;
          suggested_location_area: string | null;
          confidence: number | null;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          source_input_id?: string | null;
          suggested_scope_type: string;
          suggested_name: string;
          suggested_description?: string | null;
          suggested_location_area?: string | null;
          confidence?: number | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          source_input_id?: string | null;
          suggested_scope_type?: string;
          suggested_name?: string;
          suggested_description?: string | null;
          suggested_location_area?: string | null;
          confidence?: number;
          status?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_scope_suggestions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_scope_suggestions_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_scope_suggestions_source_input_id_fkey";
            columns: ["source_input_id"];
            isOneToOne: false;
            referencedRelation: "project_scope_builder_inputs";
            referencedColumns: ["id"];
          },
        ];
      };
      project_scopes: {
        Row: {
          id: string;
          project_id: string;
          organisation_id: string;
          scope_type_id: string | null;
          name: string;
          description: string | null;
          location_area: string | null;
          notes: string | null;
          status: string;
          ai_status: string;
          ai_confidence: number | null;
          confidence_level: string | null;
          estimate_status: string;
          is_custom: boolean;
          include_in_quick_estimate: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          organisation_id: string;
          scope_type_id?: string | null;
          name: string;
          description?: string | null;
          location_area?: string | null;
          notes?: string | null;
          status?: string;
          ai_status?: string;
          ai_confidence?: number | null;
          confidence_level?: string | null;
          estimate_status?: string;
          is_custom?: boolean;
          include_in_quick_estimate?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          organisation_id?: string;
          scope_type_id?: string | null;
          name?: string;
          description?: string | null;
          location_area?: string | null;
          notes?: string | null;
          status?: string;
          ai_status?: string;
          ai_confidence?: number | null;
          confidence_level?: string | null;
          estimate_status?: string;
          is_custom?: boolean;
          include_in_quick_estimate?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_scopes_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
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
      project_trades: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          project_scope_id: string | null;
          trade_name: string;
          note: string | null;
          source: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          project_scope_id?: string | null;
          trade_name: string;
          note?: string | null;
          source?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          project_scope_id?: string | null;
          trade_name?: string;
          note?: string | null;
          source?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_trades_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_trades_project_scope_id_fkey";
            columns: ["project_scope_id"];
            isOneToOne: false;
            referencedRelation: "project_scopes";
            referencedColumns: ["id"];
          },
        ];
      };
      discovery_runs: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          input_text: string | null;
          input_hash: string | null;
          provider: string;
          model: string | null;
          prompt_version: string;
          raw_output: Json | null;
          parsed_output: Json | null;
          status: string;
          error_message: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          input_text?: string | null;
          input_hash?: string | null;
          provider?: string;
          model?: string | null;
          prompt_version?: string;
          raw_output?: Json | null;
          parsed_output?: Json | null;
          status?: string;
          error_message?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          input_text?: string | null;
          input_hash?: string | null;
          provider?: string;
          model?: string | null;
          prompt_version?: string;
          raw_output?: Json | null;
          parsed_output?: Json | null;
          status?: string;
          error_message?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discovery_runs_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      discovery_outputs: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          discovery_run_id: string;
          output_type: string;
          output_key: string;
          title: string | null;
          content: Json;
          confidence: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          discovery_run_id: string;
          output_type: string;
          output_key: string;
          title?: string | null;
          content?: Json;
          confidence?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          discovery_run_id?: string;
          output_type?: string;
          output_key?: string;
          title?: string | null;
          content?: Json;
          confidence?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discovery_outputs_discovery_run_id_fkey";
            columns: ["discovery_run_id"];
            isOneToOne: false;
            referencedRelation: "discovery_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discovery_outputs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discovery_outputs_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      project_discovery_runs: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          source_notes: string | null;
          provider: string;
          provider_version: string;
          work_areas: Json;
          facts: Json;
          questions: Json;
          constraints: Json;
          trades: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          source_notes?: string | null;
          provider: string;
          provider_version: string;
          work_areas?: Json;
          facts?: Json;
          questions?: Json;
          constraints?: Json;
          trades?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          source_notes?: string | null;
          provider?: string;
          provider_version?: string;
          work_areas?: Json;
          facts?: Json;
          questions?: Json;
          constraints?: Json;
          trades?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_discovery_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_discovery_runs_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      quick_estimates: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          status: string;
          source_notes: string | null;
          estimated_cost_low: number | null;
          estimated_cost_high: number | null;
          recommended_sell_low: number | null;
          recommended_sell_high: number | null;
          target_margin_percent: number | null;
          expected_margin_percent: number | null;
          confidence_level: string;
          budget_fit: string | null;
          client_budget: number | null;
          quality_level: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          status?: string;
          source_notes?: string | null;
          estimated_cost_low?: number | null;
          estimated_cost_high?: number | null;
          recommended_sell_low?: number | null;
          recommended_sell_high?: number | null;
          target_margin_percent?: number | null;
          expected_margin_percent?: number | null;
          confidence_level?: string;
          budget_fit?: string | null;
          client_budget?: number | null;
          quality_level?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          status?: string;
          source_notes?: string | null;
          estimated_cost_low?: number | null;
          estimated_cost_high?: number | null;
          recommended_sell_low?: number | null;
          recommended_sell_high?: number | null;
          target_margin_percent?: number | null;
          expected_margin_percent?: number | null;
          confidence_level?: string;
          budget_fit?: string | null;
          client_budget?: number | null;
          quality_level?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quick_estimates_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quick_estimates_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      quick_estimate_snapshots: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id: string | null;
          snapshot_at: string;
          confidence_score: number | null;
          confidence_level: string | null;
          estimated_cost_low: number | null;
          estimated_cost_high: number | null;
          sell_low: number | null;
          sell_high: number | null;
          central_estimate: number | null;
          target_margin_percent: number | null;
          contingency_percent: number | null;
          rate_source: string | null;
          trigger_event: string | null;
          calculation_trace: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id?: string | null;
          snapshot_at?: string;
          confidence_score?: number | null;
          confidence_level?: string | null;
          estimated_cost_low?: number | null;
          estimated_cost_high?: number | null;
          sell_low?: number | null;
          sell_high?: number | null;
          central_estimate?: number | null;
          target_margin_percent?: number | null;
          contingency_percent?: number | null;
          rate_source?: string | null;
          trigger_event?: string | null;
          calculation_trace?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          quick_estimate_id?: string | null;
          snapshot_at?: string;
          confidence_score?: number | null;
          confidence_level?: string | null;
          estimated_cost_low?: number | null;
          estimated_cost_high?: number | null;
          sell_low?: number | null;
          sell_high?: number | null;
          central_estimate?: number | null;
          target_margin_percent?: number | null;
          contingency_percent?: number | null;
          rate_source?: string | null;
          trigger_event?: string | null;
          calculation_trace?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quick_estimate_snapshots_quick_estimate_id_fkey";
            columns: ["quick_estimate_id"];
            isOneToOne: false;
            referencedRelation: "quick_estimates";
            referencedColumns: ["id"];
          },
        ];
      };
      quick_estimate_answers: {
        Row: {
          id: string;
          organisation_id: string;
          quick_estimate_id: string;
          project_id: string;
          question_key: string;
          question_text: string;
          answer: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          quick_estimate_id: string;
          project_id: string;
          question_key: string;
          question_text: string;
          answer?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          quick_estimate_id?: string;
          project_id?: string;
          question_key?: string;
          question_text?: string;
          answer?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quick_estimate_answers_quick_estimate_id_fkey";
            columns: ["quick_estimate_id"];
            isOneToOne: false;
            referencedRelation: "quick_estimates";
            referencedColumns: ["id"];
          },
        ];
      };
      estimate_driver_categories: {
        Row: {
          id: string;
          organisation_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          is_system: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          is_system?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          is_system?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      estimate_drivers: {
        Row: {
          id: string;
          organisation_id: string | null;
          category_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          multiplier: number;
          fixed_allowance: number;
          labour_modifier_percent: number;
          is_system: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id?: string | null;
          category_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          multiplier?: number;
          fixed_allowance?: number;
          labour_modifier_percent?: number;
          is_system?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string | null;
          category_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          multiplier?: number;
          fixed_allowance?: number;
          labour_modifier_percent?: number;
          is_system?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estimate_drivers_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "estimate_driver_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      project_estimate_drivers: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id: string | null;
          estimate_driver_id: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id?: string | null;
          estimate_driver_id: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          quick_estimate_id?: string | null;
          estimate_driver_id?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_estimate_drivers_estimate_driver_id_fkey";
            columns: ["estimate_driver_id"];
            isOneToOne: false;
            referencedRelation: "estimate_drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      project_constraint_selections: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id: string | null;
          constraint_key: string;
          label: string;
          selected: boolean;
          metadata: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id?: string | null;
          constraint_key: string;
          label: string;
          selected: boolean;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          quick_estimate_id?: string | null;
          constraint_key?: string;
          label?: string;
          selected?: boolean;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_estimate_driver_values: {
        Row: {
          id: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id: string;
          estimate_driver_id: string | null;
          constraint_key: string | null;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          project_id: string;
          quick_estimate_id: string;
          estimate_driver_id?: string | null;
          constraint_key?: string | null;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          project_id?: string;
          quick_estimate_id?: string;
          estimate_driver_id?: string | null;
          constraint_key?: string | null;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_estimate_driver_values_estimate_driver_id_fkey";
            columns: ["estimate_driver_id"];
            isOneToOne: false;
            referencedRelation: "estimate_drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      scope_rates: {
        Row: {
          id: string;
          organisation_id: string;
          scope_type_key: string;
          label: string;
          unit: string;
          budget_rate: number | null;
          standard_rate: number | null;
          premium_rate: number | null;
          default_rate: number | null;
          labour_allocation_percent: number | null;
          materials_allocation_percent: number | null;
          subcontractor_allocation_percent: number | null;
          allowance_allocation_percent: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          scope_type_key: string;
          label: string;
          unit: string;
          budget_rate?: number | null;
          standard_rate?: number | null;
          premium_rate?: number | null;
          default_rate?: number | null;
          labour_allocation_percent?: number | null;
          materials_allocation_percent?: number | null;
          subcontractor_allocation_percent?: number | null;
          allowance_allocation_percent?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          scope_type_key?: string;
          label?: string;
          unit?: string;
          budget_rate?: number | null;
          standard_rate?: number | null;
          premium_rate?: number | null;
          default_rate?: number | null;
          labour_allocation_percent?: number | null;
          materials_allocation_percent?: number | null;
          subcontractor_allocation_percent?: number | null;
          allowance_allocation_percent?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scope_rates_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      labour_rates: {
        Row: {
          id: string;
          organisation_id: string;
          name: string;
          category: string | null;
          cost_rate: number;
          charge_rate: number;
          unit: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          name: string;
          category?: string | null;
          cost_rate?: number;
          charge_rate?: number;
          unit?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          name?: string;
          category?: string | null;
          cost_rate?: number;
          charge_rate?: number;
          unit?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "labour_rates_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      material_rates: {
        Row: {
          id: string;
          organisation_id: string;
          material_name: string;
          category: string | null;
          cost_rate: number;
          charge_rate: number;
          unit: string;
          supplier: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          material_name: string;
          category?: string | null;
          cost_rate?: number;
          charge_rate?: number;
          unit?: string;
          supplier?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          material_name?: string;
          category?: string | null;
          cost_rate?: number;
          charge_rate?: number;
          unit?: string;
          supplier?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "material_rates_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      organisation_pricing_settings: {
        Row: {
          organisation_id: string;
          default_margin_percent: number;
          contingency_percent: number;
          gst_percent: number;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organisation_id: string;
          default_margin_percent?: number;
          contingency_percent?: number;
          gst_percent?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organisation_id?: string;
          default_margin_percent?: number;
          contingency_percent?: number;
          gst_percent?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organisation_pricing_settings_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: true;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      package_rates: {
        Row: {
          id: string;
          organisation_id: string;
          package_name: string;
          work_area_type: string | null;
          description: string | null;
          unit: string;
          base_cost: number;
          base_sell: number;
          low_base_cost: number | null;
          typical_base_cost: number | null;
          high_base_cost: number | null;
          low_base_sell: number | null;
          typical_base_sell: number | null;
          high_base_sell: number | null;
          default_margin: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          package_name: string;
          work_area_type?: string | null;
          description?: string | null;
          unit?: string;
          base_cost?: number;
          base_sell?: number;
          low_base_cost?: number | null;
          typical_base_cost?: number | null;
          high_base_cost?: number | null;
          low_base_sell?: number | null;
          typical_base_sell?: number | null;
          high_base_sell?: number | null;
          default_margin?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          package_name?: string;
          work_area_type?: string | null;
          description?: string | null;
          unit?: string;
          base_cost?: number;
          base_sell?: number;
          low_base_cost?: number | null;
          typical_base_cost?: number | null;
          high_base_cost?: number | null;
          low_base_sell?: number | null;
          typical_base_sell?: number | null;
          high_base_sell?: number | null;
          default_margin?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "package_rates_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      subcontractor_rates: {
        Row: {
          id: string;
          organisation_id: string;
          trade: string;
          description: string | null;
          cost_rate: number;
          charge_rate: number;
          low_cost_rate: number | null;
          typical_cost_rate: number | null;
          high_cost_rate: number | null;
          low_charge_rate: number | null;
          typical_charge_rate: number | null;
          high_charge_rate: number | null;
          default_confidence: string;
          unit: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          trade: string;
          description?: string | null;
          cost_rate?: number;
          charge_rate?: number;
          low_cost_rate?: number | null;
          typical_cost_rate?: number | null;
          high_cost_rate?: number | null;
          low_charge_rate?: number | null;
          typical_charge_rate?: number | null;
          high_charge_rate?: number | null;
          default_confidence?: string;
          unit?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          trade?: string;
          description?: string | null;
          cost_rate?: number;
          charge_rate?: number;
          low_cost_rate?: number | null;
          typical_cost_rate?: number | null;
          high_cost_rate?: number | null;
          low_charge_rate?: number | null;
          typical_charge_rate?: number | null;
          high_charge_rate?: number | null;
          default_confidence?: string;
          unit?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subcontractor_rates_organisation_id_fkey";
            columns: ["organisation_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
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
          organisation_id: string | null;
          question: string;
          question_key: string | null;
          question_type: string;
          options: Json | null;
          unit: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_scope_id: string;
          organisation_id?: string | null;
          question: string;
          question_key?: string | null;
          question_type?: string;
          options?: Json | null;
          unit?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_scope_id?: string;
          organisation_id?: string | null;
          question?: string;
          question_key?: string | null;
          question_type?: string;
          options?: Json | null;
          unit?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      scope_answers: {
        Row: {
          id: string;
          organisation_id: string;
          scope_question_id: string;
          project_scope_id: string;
          answer: string | null;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          scope_question_id: string;
          project_scope_id: string;
          answer?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          scope_question_id?: string;
          project_scope_id?: string;
          answer?: string | null;
          source?: string;
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
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ScopeType = Database["public"]["Tables"]["scope_types"]["Row"];
export type ProjectScopeBuilderInput =
  Database["public"]["Tables"]["project_scope_builder_inputs"]["Row"];
export type ProjectScopeSuggestion =
  Database["public"]["Tables"]["project_scope_suggestions"]["Row"];
export type ProjectScope = Database["public"]["Tables"]["project_scopes"]["Row"];
export type ProjectTrade = Database["public"]["Tables"]["project_trades"]["Row"];
export type ScopeRate = Database["public"]["Tables"]["scope_rates"]["Row"];
export type LabourRate = Database["public"]["Tables"]["labour_rates"]["Row"];
export type MaterialRate = Database["public"]["Tables"]["material_rates"]["Row"];
export type OrganisationPricingSettings =
  Database["public"]["Tables"]["organisation_pricing_settings"]["Row"];
export type PackageRate = Database["public"]["Tables"]["package_rates"]["Row"];
export type SubcontractorRate =
  Database["public"]["Tables"]["subcontractor_rates"]["Row"];
export type DiscoveryRun =
  Database["public"]["Tables"]["discovery_runs"]["Row"];
export type DiscoveryOutput =
  Database["public"]["Tables"]["discovery_outputs"]["Row"];
export type ProjectDiscoveryRun =
  Database["public"]["Tables"]["project_discovery_runs"]["Row"];
export type QuickEstimate =
  Database["public"]["Tables"]["quick_estimates"]["Row"];
export type QuickEstimateAnswer =
  Database["public"]["Tables"]["quick_estimate_answers"]["Row"];
export type EstimateDriverCategory =
  Database["public"]["Tables"]["estimate_driver_categories"]["Row"];
export type EstimateDriver =
  Database["public"]["Tables"]["estimate_drivers"]["Row"];
export type ProjectEstimateDriver =
  Database["public"]["Tables"]["project_estimate_drivers"]["Row"];
export type ProjectEstimateDriverValue =
  Database["public"]["Tables"]["project_estimate_driver_values"]["Row"];
export type ScopeMeasurement =
  Database["public"]["Tables"]["scope_measurements"]["Row"];
export type ScopePhoto = Database["public"]["Tables"]["scope_photos"]["Row"];
export type ScopeDocument =
  Database["public"]["Tables"]["scope_documents"]["Row"];
export type ScopeQuestion =
  Database["public"]["Tables"]["scope_questions"]["Row"];
export type SiteVisit = Database["public"]["Tables"]["site_visits"]["Row"];
export type SiteVisitMeasurement =
  Database["public"]["Tables"]["site_visit_measurements"]["Row"];
export type SiteVisitPhoto =
  Database["public"]["Tables"]["site_visit_photos"]["Row"];

export type SiteVisitWithRelations = SiteVisit & {
  site_visit_measurements: SiteVisitMeasurement[];
  site_visit_photos: SiteVisitPhoto[];
};

export type EstimateDriverCategoryWithDrivers = EstimateDriverCategory & {
  estimate_drivers: EstimateDriver[];
};

export type ProjectEstimateDriverWithDetails = ProjectEstimateDriver & {
  estimate_drivers: Pick<
    EstimateDriver,
    | "id"
    | "name"
    | "slug"
    | "description"
    | "multiplier"
    | "fixed_allowance"
    | "labour_modifier_percent"
  > | null;
};
