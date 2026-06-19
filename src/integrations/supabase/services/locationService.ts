import { supabase } from '../client';
import { Location } from '../types';

export const getLocations = async (): Promise<Location[]> => {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .order('state', { ascending: true })
    .order('city', { ascending: true });

  if (error) {
    console.error('Error fetching locations:', error);
    throw error;
  }
  return data || [];
};

export const addLocation = async (state: string, city: string): Promise<Location> => {
  const { data, error } = await supabase
    .from('locations')
    .insert([{ state, city }])
    .select()
    .single();

  if (error) {
    console.error('Error adding location:', error);
    throw error;
  }
  return data;
};

export const updateLocation = async (id: string, state: string, city: string): Promise<Location> => {
  const { data, error } = await supabase
    .from('locations')
    .update({ state, city })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating location:', error);
    throw error;
  }
  return data;
};

export const deleteLocation = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting location:', error);
    throw error;
  }
};
