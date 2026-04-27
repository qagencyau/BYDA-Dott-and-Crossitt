<?php

defined('ABSPATH') || exit;

function byda_iet_get_buffer_meters($settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	return max(1, (int) $settings['default_buffer_meters']);
}

function byda_iet_search_addresses($address, $settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	$state = isset($address['state']) ? strtoupper((string) $address['state']) : '';

	switch ($state) {
		case 'NSW':
			$sites = byda_iet_search_nsw_addresses($address, $settings);
			break;
		case 'QLD':
			$sites = byda_iet_search_qld_addresses($address, $settings);
			break;
		case 'VIC':
			$sites = byda_iet_search_vic_addresses($address, $settings);
			break;
		default:
			return new WP_Error('byda_iet_invalid_state', 'Unsupported state.');
	}

	if (is_wp_error($sites)) {
		return $sites;
	}

	return array_slice($sites, 0, max(1, (int) $settings['max_address_candidates']));
}

function byda_iet_enrich_site($site, $settings = null) {
	$state = isset($site['state']) ? strtoupper((string) $site['state']) : '';

	switch ($state) {
		case 'NSW':
			return byda_iet_enrich_nsw_site($site, $settings);
		case 'QLD':
			return byda_iet_enrich_qld_site($site, $settings);
		case 'VIC':
			return byda_iet_enrich_vic_site($site, $settings);
		default:
			return new WP_Error('byda_iet_invalid_state', 'Unsupported state.');
	}
}

function byda_iet_search_nsw_addresses($address, $settings = null) {
	$street = byda_iet_parse_street_input(isset($address['streetName']) ? $address['streetName'] : '');
	$url = byda_iet_build_url(
		'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Geocoded_Addressing_Theme/FeatureServer/1/query',
		array(
			'where' => implode(
				' and ',
				array(
					"housenumber = '" . byda_iet_escape_sql_literal(byda_iet_normalize_upper(isset($address['streetNumber']) ? $address['streetNumber'] : '')) . "'",
					"address like '%" . byda_iet_escape_sql_literal(isset($street['roadName']) ? $street['roadName'] : '') . "%'",
				)
			),
			'outFields' => 'gurasid,address',
			'returnGeometry' => 'true',
			'outSR' => 4326,
			'resultRecordCount' => 20,
			'f' => 'json',
		)
	);
	$response = byda_iet_remote_json_request('GET', $url, array());

	if (is_wp_error($response)) {
		return $response;
	}

	$features = isset($response['features']) && is_array($response['features']) ? $response['features'] : array();
	$sites = array();

	foreach ($features as $feature) {
		if (empty($feature['geometry'])) {
			continue;
		}

		$point = array(
			'lat' => (float) $feature['geometry']['y'],
			'lng' => (float) $feature['geometry']['x'],
		);
		$sites[] = array(
			'id' => 'nsw:' . (isset($feature['attributes']['gurasid']) ? $feature['attributes']['gurasid'] : wp_generate_uuid4()),
			'label' => isset($feature['attributes']['address']) ? $feature['attributes']['address'] : '',
			'state' => 'NSW',
			'address' => $address,
			'point' => $point,
			'polygon' => byda_iet_create_buffered_square($point, byda_iet_get_buffer_meters($settings)),
			'source' => 'NSW AddressPoint',
			'metadata' => array(
				'gurasid' => isset($feature['attributes']['gurasid']) ? $feature['attributes']['gurasid'] : null,
			),
		);
	}

	usort(
		$sites,
		static function ($left, $right) use ($address) {
			return byda_iet_rank_address_candidate($address, $right['label']) - byda_iet_rank_address_candidate($address, $left['label']);
		}
	);

	$suburb = byda_iet_normalize_upper(isset($address['suburb']) ? $address['suburb'] : '');
	$suburb_matches = array_values(
		array_filter(
			$sites,
			static function ($site) use ($suburb) {
				return '' !== $suburb && false !== strpos(byda_iet_normalize_upper(isset($site['label']) ? $site['label'] : ''), $suburb);
			}
		)
	);

	return byda_iet_dedupe_sites(!empty($suburb_matches) ? $suburb_matches : $sites);
}

function byda_iet_enrich_nsw_site($site, $settings = null) {
	if (empty($site['point'])) {
		return $site;
	}

	$url = byda_iet_build_url(
		'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/MapServer/8/query',
		array(
			'where' => '1=1',
			'geometry' => wp_json_encode(
				array(
					'x' => (float) $site['point']['lng'],
					'y' => (float) $site['point']['lat'],
					'spatialReference' => array('wkid' => 4326),
				)
			),
			'geometryType' => 'esriGeometryPoint',
			'inSR' => 4326,
			'spatialRel' => 'esriSpatialRelIntersects',
			'outFields' => 'lotnumber,planlabel,lotidstring',
			'returnGeometry' => 'true',
			'geometryPrecision' => 6,
			'outSR' => 4326,
			'resultRecordCount' => 1,
			'f' => 'json',
		)
	);
	$response = byda_iet_remote_json_request('GET', $url, array());

	if (is_wp_error($response)) {
		return $site;
	}

	$feature = isset($response['features'][0]) ? $response['features'][0] : null;
	$polygon = !empty($feature['geometry']['rings']) ? byda_iet_polygon_from_arcgis_rings($feature['geometry']['rings']) : null;
	if (!$polygon) {
		return $site;
	}

	$site['polygon'] = $polygon;
	$site['source'] = 'NSW Cadastral lot';
	$site['metadata'] = array_merge(
		isset($site['metadata']) && is_array($site['metadata']) ? $site['metadata'] : array(),
		array(
			'lotnumber' => isset($feature['attributes']['lotnumber']) ? $feature['attributes']['lotnumber'] : null,
			'planlabel' => isset($feature['attributes']['planlabel']) ? $feature['attributes']['planlabel'] : null,
			'lotidstring' => isset($feature['attributes']['lotidstring']) ? $feature['attributes']['lotidstring'] : null,
		)
	);

	return $site;
}

function byda_iet_search_qld_addresses($address, $settings = null) {
	$street = byda_iet_parse_street_input(isset($address['streetName']) ? $address['streetName'] : '');
	$clauses = array(
		"street_number = '" . byda_iet_escape_sql_literal(trim((string) $address['streetNumber'])) . "'",
		"street_name = '" . byda_iet_escape_sql_literal(byda_iet_normalize_title(isset($street['roadName']) ? $street['roadName'] : '')) . "'",
		"locality = '" . byda_iet_escape_sql_literal(byda_iet_normalize_title(isset($address['suburb']) ? $address['suburb'] : '')) . "'",
	);

	if (!empty($street['roadType'])) {
		$clauses[] = "street_type = '" . byda_iet_escape_sql_literal(byda_iet_normalize_title($street['roadType'])) . "'";
	}

	$url = byda_iet_build_url(
		'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/0/query',
		array(
			'where' => implode(' and ', $clauses),
			'outFields' => 'address,lotplan,latitude,longitude',
			'returnGeometry' => 'true',
			'outSR' => 4326,
			'resultRecordCount' => 10,
			'f' => 'json',
		)
	);
	$response = byda_iet_remote_json_request('GET', $url, array());

	if (is_wp_error($response)) {
		return $response;
	}

	$features = isset($response['features']) && is_array($response['features']) ? $response['features'] : array();
	$sites = array();

	foreach ($features as $feature) {
		if (empty($feature['geometry'])) {
			continue;
		}

		$point = array(
			'lat' => (float) $feature['geometry']['y'],
			'lng' => (float) $feature['geometry']['x'],
		);
		$sites[] = array(
			'id' => 'qld:' . (isset($feature['attributes']['lotplan']) ? $feature['attributes']['lotplan'] : wp_generate_uuid4()),
			'label' => isset($feature['attributes']['address']) ? $feature['attributes']['address'] : '',
			'state' => 'QLD',
			'address' => $address,
			'point' => $point,
			'polygon' => byda_iet_create_buffered_square($point, byda_iet_get_buffer_meters($settings)),
			'source' => 'QLD Addresses',
			'metadata' => array(
				'lotplan' => isset($feature['attributes']['lotplan']) ? $feature['attributes']['lotplan'] : null,
			),
		);
	}

	usort(
		$sites,
		static function ($left, $right) use ($address) {
			return byda_iet_rank_address_candidate($address, $right['label']) - byda_iet_rank_address_candidate($address, $left['label']);
		}
	);

	return byda_iet_dedupe_sites($sites);
}

function byda_iet_enrich_qld_site($site, $settings = null) {
	$lotplan = isset($site['metadata']['lotplan']) ? (string) $site['metadata']['lotplan'] : '';
	if ('' === $lotplan || 0 === strpos($lotplan, '9999')) {
		return $site;
	}

	$url = byda_iet_build_url(
		'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4/query',
		array(
			'where' => "lotplan = '" . byda_iet_escape_sql_literal($lotplan) . "'",
			'outFields' => 'lotplan',
			'returnGeometry' => 'true',
			'geometryPrecision' => 6,
			'outSR' => 4326,
			'resultRecordCount' => 1,
			'f' => 'json',
		)
	);
	$response = byda_iet_remote_json_request('GET', $url, array());

	if (is_wp_error($response)) {
		return $site;
	}

	$feature = isset($response['features'][0]) ? $response['features'][0] : null;
	$polygon = !empty($feature['geometry']['rings']) ? byda_iet_polygon_from_arcgis_rings($feature['geometry']['rings']) : null;
	if (!$polygon) {
		return $site;
	}

	$site['polygon'] = $polygon;
	$site['source'] = 'QLD Cadastral parcel';

	return $site;
}

function byda_iet_search_vic_addresses($address, $settings = null) {
	$street = byda_iet_parse_street_input(isset($address['streetName']) ? $address['streetName'] : '');
	$url = byda_iet_build_url(
		'https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/arcgis/rest/services/Vicmap_Address/FeatureServer/0/query',
		array(
			'where' => implode(
				' and ',
				array(
					'house_number_1 = ' . (int) $address['streetNumber'],
					"road_name like '" . byda_iet_escape_sql_literal(isset($street['roadName']) ? $street['roadName'] : '') . "%'",
					"locality_name = '" . byda_iet_escape_sql_literal(byda_iet_normalize_upper(isset($address['suburb']) ? $address['suburb'] : '')) . "'",
					"postcode = '" . byda_iet_escape_sql_literal(isset($address['postcode']) ? $address['postcode'] : '') . "'",
				)
			),
			'outFields' => 'ezi_address,postcode,locality_name,road_type',
			'returnGeometry' => 'true',
			'outSR' => 4326,
			'resultRecordCount' => 10,
			'f' => 'json',
		)
	);
	$response = byda_iet_remote_json_request('GET', $url, array());

	if (is_wp_error($response)) {
		return $response;
	}

	$features = isset($response['features']) && is_array($response['features']) ? $response['features'] : array();
	$sites = array();

	foreach ($features as $feature) {
		if (empty($feature['geometry'])) {
			continue;
		}

		$point = array(
			'lat' => (float) $feature['geometry']['y'],
			'lng' => (float) $feature['geometry']['x'],
		);
		$sites[] = array(
			'id' => 'vic:' . (isset($feature['attributes']['ezi_address']) ? $feature['attributes']['ezi_address'] : wp_generate_uuid4()),
			'label' => isset($feature['attributes']['ezi_address']) ? $feature['attributes']['ezi_address'] : '',
			'state' => 'VIC',
			'address' => $address,
			'point' => $point,
			'polygon' => byda_iet_create_buffered_square($point, byda_iet_get_buffer_meters($settings)),
			'source' => 'Vicmap Address',
		);
	}

	usort(
		$sites,
		static function ($left, $right) use ($address) {
			return byda_iet_rank_address_candidate($address, $right['label']) - byda_iet_rank_address_candidate($address, $left['label']);
		}
	);

	return byda_iet_dedupe_sites($sites);
}

function byda_iet_enrich_vic_site($site, $settings = null) {
	if (empty($site['point'])) {
		return $site;
	}

	$url = byda_iet_build_url(
		'https://spatial.planning.vic.gov.au/gis/rest/services/property_and_parcel/MapServer/4/query',
		array(
			'where' => '1=1',
			'geometry' => wp_json_encode(
				array(
					'x' => (float) $site['point']['lng'],
					'y' => (float) $site['point']['lat'],
					'spatialReference' => array('wkid' => 4326),
				)
			),
			'geometryType' => 'esriGeometryPoint',
			'inSR' => 4326,
			'spatialRel' => 'esriSpatialRelIntersects',
			'outFields' => 'PARCEL_PFI,PARCEL_SPI,PARCEL_PLAN_NUMBER,PARCEL_LOT_NUMBER',
			'returnGeometry' => 'true',
			'geometryPrecision' => 6,
			'outSR' => 4326,
			'resultRecordCount' => 1,
			'f' => 'json',
		)
	);
	$response = byda_iet_remote_json_request('GET', $url, array());

	if (is_wp_error($response)) {
		return $site;
	}

	$feature = isset($response['features'][0]) ? $response['features'][0] : null;
	$polygon = !empty($feature['geometry']['rings']) ? byda_iet_polygon_from_arcgis_rings($feature['geometry']['rings']) : null;
	if (!$polygon) {
		return $site;
	}

	$site['polygon'] = $polygon;
	$site['source'] = 'VIC Cadastral parcel';
	$site['metadata'] = array_merge(
		isset($site['metadata']) && is_array($site['metadata']) ? $site['metadata'] : array(),
		array(
			'parcelPfi' => isset($feature['attributes']['PARCEL_PFI']) ? $feature['attributes']['PARCEL_PFI'] : null,
			'parcelSpi' => isset($feature['attributes']['PARCEL_SPI']) ? $feature['attributes']['PARCEL_SPI'] : null,
			'parcelPlanNumber' => isset($feature['attributes']['PARCEL_PLAN_NUMBER']) ? $feature['attributes']['PARCEL_PLAN_NUMBER'] : null,
			'parcelLotNumber' => isset($feature['attributes']['PARCEL_LOT_NUMBER']) ? $feature['attributes']['PARCEL_LOT_NUMBER'] : null,
		)
	);

	return $site;
}
