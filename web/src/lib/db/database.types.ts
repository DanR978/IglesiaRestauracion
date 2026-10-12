export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.4';
  };
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          body: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: string;
          is_read: boolean;
          link: string | null;
          title: string;
          type: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title: string;
          type: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [];
      };
      admins: {
        Row: {
          user_id: string;
        };
        Insert: {
          user_id: string;
        };
        Update: {
          user_id?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          label: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          label?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          label?: string | null;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          cancelled: boolean | null;
          category: string | null;
          created_at: string | null;
          created_by: string | null;
          date: string;
          description: string | null;
          id: string;
          location: string | null;
          ministry_id: string | null;
          time: string | null;
          title: string;
        };
        Insert: {
          cancelled?: boolean | null;
          category?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          date: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          ministry_id?: string | null;
          time?: string | null;
          title: string;
        };
        Update: {
          cancelled?: boolean | null;
          category?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          date?: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          ministry_id?: string | null;
          time?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_events_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_presets: {
        Row: {
          category: string | null;
          created_at: string | null;
          created_by: string | null;
          day_of_week: number;
          description: string | null;
          id: string;
          location: string | null;
          name: string;
          nth_week: number | null;
          pattern_type: string;
          sort_order: number | null;
          time: string | null;
        };
        Insert: {
          category?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          day_of_week: number;
          description?: string | null;
          id?: string;
          location?: string | null;
          name: string;
          nth_week?: number | null;
          pattern_type: string;
          sort_order?: number | null;
          time?: string | null;
        };
        Update: {
          category?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          day_of_week?: number;
          description?: string | null;
          id?: string;
          location?: string | null;
          name?: string;
          nth_week?: number | null;
          pattern_type?: string;
          sort_order?: number | null;
          time?: string | null;
        };
        Relationships: [];
      };
      design_shares: {
        Row: {
          added_by: string;
          created_at: string;
          design_id: string;
          user_id: string;
        };
        Insert: {
          added_by?: string;
          created_at?: string;
          design_id: string;
          user_id: string;
        };
        Update: {
          added_by?: string;
          created_at?: string;
          design_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'design_shares_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'design_shares_design_id_fkey';
            columns: ['design_id'];
            isOneToOne: false;
            referencedRelation: 'designs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'design_shares_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      designs: {
        Row: {
          created_at: string;
          created_by: string;
          doc: Json;
          event_id: string | null;
          height: number;
          id: string;
          kind: string;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
          width: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          doc?: Json;
          event_id?: string | null;
          height: number;
          id?: string;
          kind?: string;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
          width: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          doc?: Json;
          event_id?: string | null;
          height?: number;
          id?: string;
          kind?: string;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'designs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'designs_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'special_events';
            referencedColumns: ['id'];
          },
        ];
      };
      discipleship_groups: {
        Row: {
          capacity: number | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_on: string | null;
          id: string;
          is_published: boolean;
          leader_id: string | null;
          leader_name: string | null;
          level: number;
          location_address: string | null;
          location_name: string | null;
          meeting_day: string | null;
          meeting_time: string | null;
          member_count: number;
          name: string;
          notes: string | null;
          slug: string | null;
          starts_on: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          capacity?: number | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_on?: string | null;
          id?: string;
          is_published?: boolean;
          leader_id?: string | null;
          leader_name?: string | null;
          level: number;
          location_address?: string | null;
          location_name?: string | null;
          meeting_day?: string | null;
          meeting_time?: string | null;
          member_count?: number;
          name: string;
          notes?: string | null;
          slug?: string | null;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          capacity?: number | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_on?: string | null;
          id?: string;
          is_published?: boolean;
          leader_id?: string | null;
          leader_name?: string | null;
          level?: number;
          location_address?: string | null;
          location_name?: string | null;
          meeting_day?: string | null;
          meeting_time?: string | null;
          member_count?: number;
          name?: string;
          notes?: string | null;
          slug?: string | null;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      discipleship_interests: {
        Row: {
          age_range: string | null;
          assigned_group_id: string | null;
          bringing_family: string | null;
          can_host: boolean | null;
          contacted_at: string | null;
          created_at: string;
          email: string | null;
          experience_level: number | null;
          full_name: string;
          gender: string | null;
          has_transportation: boolean | null;
          home_address: string | null;
          id: string;
          message: string | null;
          phone: string | null;
          preferred_day: string | null;
          preferred_time: string | null;
          source: string;
          status: string;
          target_group_id: string | null;
        };
        Insert: {
          age_range?: string | null;
          assigned_group_id?: string | null;
          bringing_family?: string | null;
          can_host?: boolean | null;
          contacted_at?: string | null;
          created_at?: string;
          email?: string | null;
          experience_level?: number | null;
          full_name: string;
          gender?: string | null;
          has_transportation?: boolean | null;
          home_address?: string | null;
          id?: string;
          message?: string | null;
          phone?: string | null;
          preferred_day?: string | null;
          preferred_time?: string | null;
          source?: string;
          status?: string;
          target_group_id?: string | null;
        };
        Update: {
          age_range?: string | null;
          assigned_group_id?: string | null;
          bringing_family?: string | null;
          can_host?: boolean | null;
          contacted_at?: string | null;
          created_at?: string;
          email?: string | null;
          experience_level?: number | null;
          full_name?: string;
          gender?: string | null;
          has_transportation?: boolean | null;
          home_address?: string | null;
          id?: string;
          message?: string | null;
          phone?: string | null;
          preferred_day?: string | null;
          preferred_time?: string | null;
          source?: string;
          status?: string;
          target_group_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'discipleship_interests_assigned_group_id_fkey';
            columns: ['assigned_group_id'];
            isOneToOne: false;
            referencedRelation: 'discipleship_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'discipleship_interests_target_group_id_fkey';
            columns: ['target_group_id'];
            isOneToOne: false;
            referencedRelation: 'discipleship_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      discipleship_members: {
        Row: {
          email: string | null;
          full_name: string;
          group_id: string;
          id: string;
          interest_id: string | null;
          joined_at: string;
          phone: string | null;
          role: string;
        };
        Insert: {
          email?: string | null;
          full_name: string;
          group_id: string;
          id?: string;
          interest_id?: string | null;
          joined_at?: string;
          phone?: string | null;
          role?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string;
          group_id?: string;
          id?: string;
          interest_id?: string | null;
          joined_at?: string;
          phone?: string | null;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'discipleship_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'discipleship_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'discipleship_members_interest_id_fkey';
            columns: ['interest_id'];
            isOneToOne: false;
            referencedRelation: 'discipleship_interests';
            referencedColumns: ['id'];
          },
        ];
      };
      discipleship_messages: {
        Row: {
          body: string;
          group_id: string;
          id: string;
          sent_at: string;
          sent_by: string | null;
          subject: string | null;
        };
        Insert: {
          body: string;
          group_id: string;
          id?: string;
          sent_at?: string;
          sent_by?: string | null;
          subject?: string | null;
        };
        Update: {
          body?: string;
          group_id?: string;
          id?: string;
          sent_at?: string;
          sent_by?: string | null;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'discipleship_messages_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'discipleship_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      event_registrations: {
        Row: {
          age: number;
          allergies: string | null;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          event_id: string;
          first_name: string;
          id: string;
          last_name: string;
          medical_conditions: string | null;
          notes: string | null;
          parent_email: string | null;
          parent_name: string | null;
          parent_phone: string | null;
          parent_relationship: string | null;
          registration_group_id: string | null;
          relationship: string;
          sex: string | null;
          signature_image: string | null;
          signature_name: string | null;
          submitted_at: string;
          waiver_signed_at: string | null;
          waiver_version: string | null;
        };
        Insert: {
          age: number;
          allergies?: string | null;
          contact_email?: string | null;
          contact_name: string;
          contact_phone: string;
          event_id: string;
          first_name: string;
          id?: string;
          last_name: string;
          medical_conditions?: string | null;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          parent_relationship?: string | null;
          registration_group_id?: string | null;
          relationship: string;
          sex?: string | null;
          signature_image?: string | null;
          signature_name?: string | null;
          submitted_at?: string;
          waiver_signed_at?: string | null;
          waiver_version?: string | null;
        };
        Update: {
          age?: number;
          allergies?: string | null;
          contact_email?: string | null;
          contact_name?: string;
          contact_phone?: string;
          event_id?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          medical_conditions?: string | null;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          parent_relationship?: string | null;
          registration_group_id?: string | null;
          relationship?: string;
          sex?: string | null;
          signature_image?: string | null;
          signature_name?: string | null;
          submitted_at?: string;
          waiver_signed_at?: string | null;
          waiver_version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_registrations_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'special_events';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string | null;
          id: string;
          image_url: string | null;
          location: string | null;
          ministry_id: string | null;
          organizer_email: string | null;
          organizer_name: string | null;
          starts_at: string | null;
          tag: string | null;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          image_url?: string | null;
          location?: string | null;
          ministry_id?: string | null;
          organizer_email?: string | null;
          organizer_name?: string | null;
          starts_at?: string | null;
          tag?: string | null;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          image_url?: string | null;
          location?: string | null;
          ministry_id?: string | null;
          organizer_email?: string | null;
          organizer_name?: string | null;
          starts_at?: string | null;
          tag?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'events_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
        ];
      };
      fin_expense_categories: {
        Row: {
          archived: boolean;
          created_at: string;
          group_name: string | null;
          id: string;
          name: string;
          needs_note: boolean;
          sort: number;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          group_name?: string | null;
          id?: string;
          name: string;
          needs_note?: boolean;
          sort?: number;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          group_name?: string | null;
          id?: string;
          name?: string;
          needs_note?: boolean;
          sort?: number;
        };
        Relationships: [];
      };
      fin_expenses: {
        Row: {
          amount: number;
          category: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          fund_id: string | null;
          id: string;
          label: string | null;
          ministry_id: string | null;
          note: string | null;
          occurred_on: string;
          payee: string | null;
          project_id: string | null;
          status: string;
        };
        Insert: {
          amount: number;
          category?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          fund_id?: string | null;
          id?: string;
          label?: string | null;
          ministry_id?: string | null;
          note?: string | null;
          occurred_on?: string;
          payee?: string | null;
          project_id?: string | null;
          status?: string;
        };
        Update: {
          amount?: number;
          category?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          fund_id?: string | null;
          id?: string;
          label?: string | null;
          ministry_id?: string | null;
          note?: string | null;
          occurred_on?: string;
          payee?: string | null;
          project_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fin_expenses_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'fin_expense_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fin_expenses_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'fin_funds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fin_expenses_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fin_expenses_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'fin_projects';
            referencedColumns: ['id'];
          },
        ];
      };
      fin_funds: {
        Row: {
          archived: boolean;
          created_at: string;
          id: string;
          name: string;
          opening_balance: number;
          restricted: boolean;
          sort: number;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          opening_balance?: number;
          restricted?: boolean;
          sort?: number;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          opening_balance?: number;
          restricted?: boolean;
          sort?: number;
        };
        Relationships: [];
      };
      fin_income: {
        Row: {
          amount: number;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          fund: string | null;
          fund_id: string | null;
          id: string;
          note: string | null;
          occurred_on: string;
          project_id: string | null;
          source: string;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          fund?: string | null;
          fund_id?: string | null;
          id?: string;
          note?: string | null;
          occurred_on?: string;
          project_id?: string | null;
          source: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          fund?: string | null;
          fund_id?: string | null;
          id?: string;
          note?: string | null;
          occurred_on?: string;
          project_id?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fin_income_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'fin_income_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fin_income_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'fin_funds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fin_income_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'fin_projects';
            referencedColumns: ['id'];
          },
        ];
      };
      fin_income_categories: {
        Row: {
          archived: boolean;
          created_at: string;
          id: string;
          name: string;
          sort: number;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          sort?: number;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          sort?: number;
        };
        Relationships: [];
      };
      fin_notes: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          ministry_id: string | null;
          pinned: boolean;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          ministry_id?: string | null;
          pinned?: boolean;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          ministry_id?: string | null;
          pinned?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'fin_notes_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
        ];
      };
      fin_payables: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          creditor: string;
          due_on: string | null;
          id: string;
          ministry_id: string | null;
          note: string | null;
          paid_at: string | null;
          status: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          creditor: string;
          due_on?: string | null;
          id?: string;
          ministry_id?: string | null;
          note?: string | null;
          paid_at?: string | null;
          status?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          creditor?: string;
          due_on?: string | null;
          id?: string;
          ministry_id?: string | null;
          note?: string | null;
          paid_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fin_payables_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
        ];
      };
      fin_projects: {
        Row: {
          archived: boolean;
          color: string | null;
          created_at: string;
          icon: string | null;
          id: string;
          ministry_id: string | null;
          name: string;
          owner_id: string;
        };
        Insert: {
          archived?: boolean;
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          ministry_id?: string | null;
          name: string;
          owner_id: string;
        };
        Update: {
          archived?: boolean;
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          ministry_id?: string | null;
          name?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fin_projects_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
        ];
      };
      fin_recurring: {
        Row: {
          active: boolean;
          amount: number;
          category: string | null;
          created_at: string;
          created_by: string | null;
          day_of_month: number | null;
          frequency: string;
          id: string;
          label: string | null;
          ministry_id: string | null;
          note: string | null;
          payee: string;
        };
        Insert: {
          active?: boolean;
          amount: number;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          day_of_month?: number | null;
          frequency?: string;
          id?: string;
          label?: string | null;
          ministry_id?: string | null;
          note?: string | null;
          payee: string;
        };
        Update: {
          active?: boolean;
          amount?: number;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          day_of_month?: number | null;
          frequency?: string;
          id?: string;
          label?: string | null;
          ministry_id?: string | null;
          note?: string | null;
          payee?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fin_recurring_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
        ];
      };
      gallery_albums: {
        Row: {
          cover_photo_id: string | null;
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          event_date: string | null;
          event_type: string | null;
          id: string;
          is_featured: boolean;
          is_published: boolean;
          photo_count: number;
          slug: string | null;
          sort_order: number;
          special_event_id: string | null;
          title: string;
          updated_at: string;
          year: number;
        };
        Insert: {
          cover_photo_id?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          event_date?: string | null;
          event_type?: string | null;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          photo_count?: number;
          slug?: string | null;
          sort_order?: number;
          special_event_id?: string | null;
          title: string;
          updated_at?: string;
          year: number;
        };
        Update: {
          cover_photo_id?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          event_date?: string | null;
          event_type?: string | null;
          id?: string;
          is_featured?: boolean;
          is_published?: boolean;
          photo_count?: number;
          slug?: string | null;
          sort_order?: number;
          special_event_id?: string | null;
          title?: string;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'gallery_albums_cover_photo_fk';
            columns: ['cover_photo_id'];
            isOneToOne: false;
            referencedRelation: 'gallery_photos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'gallery_albums_special_event_id_fkey';
            columns: ['special_event_id'];
            isOneToOne: false;
            referencedRelation: 'special_events';
            referencedColumns: ['id'];
          },
        ];
      };
      gallery_photos: {
        Row: {
          album_id: string;
          caption: string | null;
          created_at: string;
          file_size: number | null;
          height: number | null;
          id: string;
          mime_type: string | null;
          public_url: string;
          sort_order: number;
          storage_path: string;
          thumbnail_url: string | null;
          uploaded_by: string | null;
          webp_url: string | null;
          width: number | null;
        };
        Insert: {
          album_id: string;
          caption?: string | null;
          created_at?: string;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          mime_type?: string | null;
          public_url: string;
          sort_order?: number;
          storage_path: string;
          thumbnail_url?: string | null;
          uploaded_by?: string | null;
          webp_url?: string | null;
          width?: number | null;
        };
        Update: {
          album_id?: string;
          caption?: string | null;
          created_at?: string;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          mime_type?: string | null;
          public_url?: string;
          sort_order?: number;
          storage_path?: string;
          thumbnail_url?: string | null;
          uploaded_by?: string | null;
          webp_url?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'gallery_photos_album_id_fkey';
            columns: ['album_id'];
            isOneToOne: false;
            referencedRelation: 'gallery_albums';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          ministry_id: string | null;
          role: string;
          status: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          ministry_id?: string | null;
          role?: string;
          status?: string;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          ministry_id?: string | null;
          role?: string;
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
        ];
      };
      ministries: {
        Row: {
          color: string | null;
          created_at: string | null;
          id: string;
          name: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      newsletter_dispatch_log: {
        Row: {
          kind: string;
          recipients: number;
          ref: string;
          sent_at: string;
        };
        Insert: {
          kind: string;
          recipients?: number;
          ref: string;
          sent_at?: string;
        };
        Update: {
          kind?: string;
          recipients?: number;
          ref?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      newsletter_subscribers: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_active: boolean;
          name: string | null;
          source: string | null;
          unsubscribe_token: string;
          unsubscribed_at: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          is_active?: boolean;
          name?: string | null;
          source?: string | null;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          name?: string | null;
          source?: string | null;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          allowed_tabs: string[];
          avatar_url: string | null;
          created_at: string | null;
          display_name: string;
          id: string;
          ministry_id: string | null;
          ministry_ids: string[];
          preset_id: string | null;
          role: string;
        };
        Insert: {
          allowed_tabs?: string[];
          avatar_url?: string | null;
          created_at?: string | null;
          display_name: string;
          id: string;
          ministry_id?: string | null;
          ministry_ids?: string[];
          preset_id?: string | null;
          role?: string;
        };
        Update: {
          allowed_tabs?: string[];
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string;
          id?: string;
          ministry_id?: string | null;
          ministry_ids?: string[];
          preset_id?: string | null;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_ministry_id_fkey';
            columns: ['ministry_id'];
            isOneToOne: false;
            referencedRelation: 'ministries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_preset_id_fkey';
            columns: ['preset_id'];
            isOneToOne: false;
            referencedRelation: 'role_presets';
            referencedColumns: ['id'];
          },
        ];
      };
      role_presets: {
        Row: {
          allowed_tabs: string[];
          base_role: string;
          color: string | null;
          created_at: string;
          icon: string | null;
          id: string;
          is_system: boolean;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          allowed_tabs?: string[];
          base_role: string;
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          allowed_tabs?: string[];
          base_role?: string;
          color?: string | null;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      special_events: {
        Row: {
          age_groups: Json;
          auto_closed_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          ends_at: string | null;
          event_at: string | null;
          id: string;
          image_url: string | null;
          information: string | null;
          location: string | null;
          registration_open: boolean;
          slug: string;
          status: string;
          title: string;
        };
        Insert: {
          age_groups?: Json;
          auto_closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          event_at?: string | null;
          id?: string;
          image_url?: string | null;
          information?: string | null;
          location?: string | null;
          registration_open?: boolean;
          slug: string;
          status?: string;
          title: string;
        };
        Update: {
          age_groups?: Json;
          auto_closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          ends_at?: string | null;
          event_at?: string | null;
          id?: string;
          image_url?: string | null;
          information?: string | null;
          location?: string | null;
          registration_open?: boolean;
          slug?: string;
          status?: string;
          title?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_edit_design: { Args: { d: string }; Returns: boolean };
      can_finance: { Args: never; Returns: boolean };
      can_join_design_topic: { Args: { topic: string }; Returns: boolean };
      close_ended_special_events: { Args: never; Returns: number };
      has_any_tab: { Args: { tabs: string[] }; Returns: boolean };
      has_tab: { Args: { tab: string }; Returns: boolean };
      is_aal2: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      is_finance: { Args: never; Returns: boolean };
      is_treasurer: { Args: never; Returns: boolean };
      list_designer_users: {
        Args: never;
        Returns: {
          avatar_url: string;
          display_name: string;
          id: string;
        }[];
      };
      my_ministry_id: { Args: never; Returns: string };
      my_ministry_ids: { Args: never; Returns: string[] };
      owns_design: { Args: { d: string }; Returns: boolean };
      set_my_avatar: { Args: { p_url: string }; Returns: undefined };
      set_my_display_name: { Args: { p_name: string }; Returns: string };
      special_event_ends: {
        Args: { ends_at: string; event_at: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
