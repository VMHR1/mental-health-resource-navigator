/**
 * Cloudflare Pages Function: Programs API
 * Serves programs.json with enhanced caching and optional filtering
 * 
 * Usage: GET /api/programs?city=Dallas&care=PHP
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  
  try {
    // Get programs.json from the static file
    // In Cloudflare Pages, static files are available via fetch
    const programsUrl = new URL('/programs.json', request.url);
    const programsResponse = await fetch(programsUrl);
    
    if (!programsResponse.ok) {
      throw new Error('Failed to load programs data');
    }

    const data = await programsResponse.json();
    
    // Parse query parameters for filtering
    const url = new URL(request.url);
    const city = url.searchParams.get('city');
    const care = url.searchParams.get('care');
    const age = url.searchParams.get('age');
    const virtual = url.searchParams.get('virtual');
    
    let programs = data.programs || [];
    
    // Apply filters if provided
    if (city) {
      const cityLower = city.toLowerCase();
      programs = programs.filter(p => 
        p.locations?.some(loc => 
          loc.city?.toLowerCase().includes(cityLower)
        )
      );
    }
    
    if (care) {
      programs = programs.filter(p => 
        p.level_of_care === care
      );
    }
    
    if (age) {
      const ageNum = parseInt(age);
      programs = programs.filter(p => {
        const ageRange = p.ages_served || '';
        // Simple age matching - can be improved
        return ageRange.includes(age) || ageRange.includes('+');
      });
    }
    
    if (virtual === 'true') {
      programs = programs.filter(p => 
        p.service_setting?.toLowerCase().includes('virtual') ||
        p.service_setting?.toLowerCase().includes('telehealth')
      );
    }
    
    // Return filtered or full data
    const responseData = {
      metadata: data.metadata || {},
      programs: programs,
      count: programs.length,
      total: data.programs?.length || 0
    };
    
    // Set cache headers
    const cacheHeaders = {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'ETag': `"${Date.now()}"`, // Simple ETag - can be improved with hash
      'Access-Control-Allow-Origin': '*'
    };
    
    // Check If-None-Match for 304 Not Modified
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === cacheHeaders['ETag']) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }
    
    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: cacheHeaders
      }
    );
    
  } catch (error) {
    console.error('Programs API error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to load programs',
        message: error.message 
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

