// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mvhdoargyijqxlufzfvm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12aGRvYXJneWlqcXhsdWZ6ZnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTM4MDksImV4cCI6MjA3MDg2OTgwOX0.Cm9mdckHeWgl2Z8eu-DFQFcncGYuwhS9DV196UrU2VE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)