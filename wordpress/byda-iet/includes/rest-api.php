<?php

defined('ABSPATH') || exit;

function byda_iet_register_rest_routes() {
	register_rest_route(
		'byda-iet/v1',
		'/options',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_options',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/addresses/search',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_search_addresses',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/enquiries/by-address',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_enquiries_by_address',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/organisations/search',
		array(
			'methods' => WP_REST_Server::CREATABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_search_organisations',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/enquiries',
		array(
			'methods' => WP_REST_Server::CREATABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_create_enquiry',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/poller-callback',
		array(
			'methods' => WP_REST_Server::CREATABLE,
			'permission_callback' => 'byda_iet_rest_poller_callback_permission',
			'callback' => 'byda_iet_rest_poller_callback',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/enquiries/(?P<token>[^/]+)',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_get_enquiry_status',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/enquiries/(?P<token>[^/]+)/report',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_enquiry_report',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/enquiries/byda/(?P<enquiryId>\d+)',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_get_remote_enquiry_status',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/enquiries/byda/(?P<enquiryId>\d+)/report',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_remote_enquiry_report',
		)
	);

	register_rest_route(
		'byda-iet/v1',
		'/mock-reports/(?P<token>[^/]+)',
		array(
			'methods' => WP_REST_Server::READABLE,
			'permission_callback' => '__return_true',
			'callback' => 'byda_iet_rest_mock_report',
		)
	);
}

function byda_iet_rest_options() {
	return rest_ensure_response(byda_iet_get_options_payload());
}

function byda_iet_rest_search_addresses(WP_REST_Request $request) {
	$address = byda_iet_validate_address(
		array(
			'streetNumber' => $request->get_param('streetNumber'),
			'streetName' => $request->get_param('streetName'),
			'suburb' => $request->get_param('suburb'),
			'state' => $request->get_param('state'),
			'postcode' => $request->get_param('postcode'),
		)
	);

	if (is_wp_error($address)) {
		return $address;
	}

	$sites = byda_iet_search_addresses($address);
	if (is_wp_error($sites)) {
		return $sites;
	}

	return rest_ensure_response(array('sites' => $sites));
}

function byda_iet_rest_enquiries_by_address(WP_REST_Request $request) {
	$address = byda_iet_validate_address(
		array(
			'streetNumber' => $request->get_param('streetNumber'),
			'streetName' => $request->get_param('streetName'),
			'suburb' => $request->get_param('suburb'),
			'state' => $request->get_param('state'),
			'postcode' => $request->get_param('postcode'),
		)
	);

	if (is_wp_error($address)) {
		return $address;
	}

	$source = $request->get_param('source');
	$limit = $request->get_param('limit');
	$created_after = $request->get_param('createdAfter');
	if (!in_array($source, array(null, '', 'local', 'byda', 'all'), true)) {
		return byda_iet_bad_request('source must be one of local, byda, or all.');
	}
	if (null !== $limit && '' !== $limit && (!is_numeric($limit) || (int) $limit < 1 || (int) $limit > 100)) {
		return byda_iet_bad_request('limit must be between 1 and 100.');
	}
	if (!empty($created_after) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $created_after)) {
		return byda_iet_bad_request('createdAfter must use YYYY-MM-DD.');
	}

	$result = byda_iet_find_enquiries_by_address(
		array(
			'address' => $address,
			'source' => !empty($source) ? $source : 'all',
			'limit' => !empty($limit) ? (int) $limit : 6,
			'createdAfter' => !empty($created_after) ? $created_after : null,
		)
	);

	$enquiries = array_map('byda_iet_to_history_payload', $result['enquiries']);

	return rest_ensure_response(
		array(
			'enquiries' => $enquiries,
			'total' => $result['total'],
		)
	);
}

function byda_iet_rest_search_organisations(WP_REST_Request $request) {
	$payload = $request->get_json_params();
	$site = byda_iet_validate_resolved_site(isset($payload['resolvedSite']) ? $payload['resolvedSite'] : null);

	if (is_wp_error($site)) {
		return $site;
	}

	return rest_ensure_response(
		array(
			'organisations' => byda_iet_list_authorities($site),
		)
	);
}

function byda_iet_rest_create_enquiry(WP_REST_Request $request) {
	$payload = $request->get_json_params();
	byda_iet_log(
		'REST create enquiry request received.',
		array(
			'route' => $request->get_route(),
			'payloadKeys' => is_array($payload) ? array_keys($payload) : null,
			'address' => is_array($payload) && isset($payload['address']) ? $payload['address'] : null,
			'userReference' => is_array($payload) && isset($payload['userReference']) ? $payload['userReference'] : null,
			'digStartAt' => is_array($payload) && isset($payload['digStartAt']) ? $payload['digStartAt'] : null,
			'digEndAt' => is_array($payload) && isset($payload['digEndAt']) ? $payload['digEndAt'] : null,
			'hasResolvedSite' => is_array($payload) && !empty($payload['resolvedSite']),
		),
		'debug'
	);
	$validated = byda_iet_validate_create_enquiry_payload($payload);

	if (is_wp_error($validated)) {
		byda_iet_log_wp_error('REST create enquiry validation failed.', $validated, array('route' => $request->get_route()));
		return $validated;
	}

	$record = byda_iet_create_enquiry($validated);
	if (is_wp_error($record)) {
		byda_iet_log_wp_error('REST create enquiry service failed.', $record, array('route' => $request->get_route()));
		return $record;
	}

	byda_iet_log(
		'REST create enquiry response prepared.',
		array(
			'record' => byda_iet_debug_record_summary($record),
		),
		'debug'
	);

	return new WP_REST_Response(
		array(
			'token' => $record['token'],
			'mode' => $record['mode'],
			'status' => $record['status'],
			'displayStatus' => !empty($record['status']) ? $record['status'] : (!empty($record['bydaStatus']) ? $record['bydaStatus'] : 'unknown'),
			'message' => $record['message'],
			'enquiryId' => isset($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : null,
			'bydaStatus' => !empty($record['bydaStatus']) ? $record['bydaStatus'] : null,
			'pollerStatus' => !empty($record['pollerStatus']) ? $record['pollerStatus'] : null,
		),
		201
	);
}

function byda_iet_rest_poller_callback(WP_REST_Request $request) {
	$payload = $request->get_json_params();
	if (!is_array($payload)) {
		byda_iet_log(
			'REST poller callback rejected because JSON payload was invalid.',
			array(
				'route' => $request->get_route(),
				'payloadType' => gettype($payload),
			),
			'warning'
		);
		return byda_iet_bad_request('JSON payload is required.');
	}

	byda_iet_log(
		'REST poller callback request received.',
		array(
			'route' => $request->get_route(),
			'payload' => byda_iet_debug_poller_payload_summary($payload),
		),
		'debug'
	);

	$record = byda_iet_handle_external_poller_callback($payload);
	if (is_wp_error($record)) {
		byda_iet_log_wp_error(
			'REST poller callback handling failed.',
			$record,
			array(
				'route' => $request->get_route(),
				'payload' => byda_iet_debug_poller_payload_summary($payload),
			)
		);
		return $record;
	}

	byda_iet_log(
		'REST poller callback response prepared.',
		array(
			'record' => byda_iet_debug_record_summary($record),
		),
		'debug'
	);

	return rest_ensure_response(
		array(
			'ok' => true,
			'token' => $record['token'],
			'status' => $record['status'],
			'reportUrl' => isset($record['reportUrl']) ? $record['reportUrl'] : null,
		)
	);
}

function byda_iet_rest_get_enquiry_status(WP_REST_Request $request) {
	$token = (string) $request->get_param('token');
	byda_iet_log(
		'REST local enquiry status requested.',
		array(
			'route' => $request->get_route(),
			'token' => $token,
		),
		'debug'
	);
	$record = byda_iet_get_enquiry_status_record($token);

	if (!$record) {
		byda_iet_log(
			'REST local enquiry status not found.',
			array(
				'route' => $request->get_route(),
				'token' => $token,
			),
			'warning'
		);
		return new WP_Error('byda_iet_not_found', 'Tracking token not found.', array('status' => 404));
	}

	$payload = byda_iet_to_status_payload($record);
	byda_iet_log(
		'REST local enquiry status response prepared.',
		array(
			'record' => byda_iet_debug_record_summary($record),
			'response' => array(
				'status' => isset($payload['status']) ? $payload['status'] : null,
				'displayStatus' => isset($payload['displayStatus']) ? $payload['displayStatus'] : null,
				'bydaStatus' => isset($payload['bydaStatus']) ? $payload['bydaStatus'] : null,
				'pollerStatus' => isset($payload['pollerStatus']) ? $payload['pollerStatus'] : null,
				'readyUrl' => byda_iet_debug_url_summary(isset($payload['readyUrl']) ? $payload['readyUrl'] : ''),
				'fileUrl' => byda_iet_debug_url_summary(isset($payload['fileUrl']) ? $payload['fileUrl'] : ''),
				'shareUrl' => byda_iet_debug_url_summary(isset($payload['shareUrl']) ? $payload['shareUrl'] : ''),
			),
		),
		'debug'
	);

	return rest_ensure_response($payload);
}

function byda_iet_rest_get_remote_enquiry_status(WP_REST_Request $request) {
	$enquiry_id = (int) $request->get_param('enquiryId');
	if ($enquiry_id < 1) {
		return byda_iet_bad_request('enquiryId must be a positive integer.');
	}

	$status = byda_iet_get_remote_enquiry_status($enquiry_id);
	if (is_wp_error($status)) {
		return $status;
	}

	return rest_ensure_response(byda_iet_to_history_payload($status));
}

function byda_iet_rest_enquiry_report(WP_REST_Request $request) {
	$token = (string) $request->get_param('token');
	byda_iet_log(
		'REST local enquiry report requested.',
		array(
			'route' => $request->get_route(),
			'token' => $token,
		),
		'debug'
	);
	$report_url = byda_iet_get_enquiry_report_url(array('token' => $token));

	if (!$report_url) {
		byda_iet_log(
			'REST local enquiry report is not available yet.',
			array(
				'route' => $request->get_route(),
				'token' => $token,
			),
			'warning'
		);
		return new WP_Error('byda_iet_not_found', 'Report is not available for this enquiry yet.', array('status' => 404));
	}

	byda_iet_log(
		'REST local enquiry report redirecting.',
		array(
			'route' => $request->get_route(),
			'token' => $token,
			'reportUrl' => byda_iet_debug_url_summary($report_url),
		),
		'debug'
	);
	wp_redirect($report_url, 302, 'BYDA IET');
	exit;
}

function byda_iet_rest_remote_enquiry_report(WP_REST_Request $request) {
	$enquiry_id = (int) $request->get_param('enquiryId');
	if ($enquiry_id < 1) {
		return byda_iet_bad_request('enquiryId must be a positive integer.');
	}

	$report_url = byda_iet_get_enquiry_report_url(array('enquiryId' => $enquiry_id));
	if (!$report_url) {
		return new WP_Error('byda_iet_not_found', 'Report is not available for this enquiry yet.', array('status' => 404));
	}

	wp_redirect($report_url, 302, 'BYDA IET');
	exit;
}

function byda_iet_rest_mock_report(WP_REST_Request $request) {
	$token = (string) $request->get_param('token');
	$record = byda_iet_get_enquiry_record($token);

	if (!$record) {
		status_header(404);
		header('Content-Type: text/plain; charset=utf-8');
		echo 'Mock report not found.';
		exit;
	}

	status_header(200);
	header('Content-Type: text/html; charset=utf-8');
	echo byda_iet_render_mock_report_html($record);
	exit;
}

function byda_iet_bad_request($message) {
	return new WP_Error('byda_iet_bad_request', $message, array('status' => 400));
}

function byda_iet_validate_address($address) {
	if (!is_array($address)) {
		return byda_iet_bad_request('Address payload is required.');
	}

	$street_number = trim((string) (isset($address['streetNumber']) ? $address['streetNumber'] : ''));
	$street_name = trim((string) (isset($address['streetName']) ? $address['streetName'] : ''));
	$suburb = trim((string) (isset($address['suburb']) ? $address['suburb'] : ''));
	$state = strtoupper(trim((string) (isset($address['state']) ? $address['state'] : '')));
	$postcode = preg_replace('/\D/', '', (string) (isset($address['postcode']) ? $address['postcode'] : ''));

	if ('' === $street_number || strlen($street_number) > 20) {
		return byda_iet_bad_request('streetNumber is required and must be 20 characters or fewer.');
	}
	$street_name = byda_iet_strip_leading_street_number($street_name, $street_number);
	if (strlen($street_name) < 2 || strlen($street_name) > 100) {
		return byda_iet_bad_request('streetName is required and must be between 2 and 100 characters.');
	}
	if (strlen($suburb) < 2 || strlen($suburb) > 80) {
		return byda_iet_bad_request('suburb is required and must be between 2 and 80 characters.');
	}
	if (!in_array($state, array('NSW', 'QLD', 'VIC'), true)) {
		return byda_iet_bad_request('state must be NSW, QLD, or VIC.');
	}
	if (!preg_match('/^\d{4}$/', $postcode)) {
		return byda_iet_bad_request('postcode must be exactly 4 digits.');
	}

	return array(
		'streetNumber' => $street_number,
		'streetName' => $street_name,
		'suburb' => $suburb,
		'state' => $state,
		'postcode' => $postcode,
	);
}

function byda_iet_validate_resolved_site($site) {
	if (!is_array($site) || empty($site)) {
		return byda_iet_bad_request('resolvedSite is required.');
	}

	$address = byda_iet_validate_address(isset($site['address']) ? $site['address'] : null);
	if (is_wp_error($address)) {
		return $address;
	}

	if (empty($site['id']) || empty($site['label']) || empty($site['source'])) {
		return byda_iet_bad_request('resolvedSite must include id, label, and source.');
	}
	if (!in_array(strtoupper((string) $site['state']), array('NSW', 'QLD', 'VIC'), true)) {
		return byda_iet_bad_request('resolvedSite.state must be NSW, QLD, or VIC.');
	}
	if (!isset($site['point']['lat']) || !isset($site['point']['lng'])) {
		return byda_iet_bad_request('resolvedSite.point must include lat and lng.');
	}
	if (
		empty($site['polygon']['type']) ||
		'Polygon' !== $site['polygon']['type'] ||
		empty($site['polygon']['coordinates']) ||
		!is_array($site['polygon']['coordinates'])
	) {
		return byda_iet_bad_request('resolvedSite.polygon must be a GeoJSON Polygon.');
	}

	$site['address'] = $address;
	$site['state'] = strtoupper((string) $site['state']);
	$site['point'] = array(
		'lat' => (float) $site['point']['lat'],
		'lng' => (float) $site['point']['lng'],
	);

	return $site;
}

function byda_iet_validate_create_enquiry_payload($payload) {
	if (!is_array($payload) || empty($payload)) {
		return byda_iet_bad_request('JSON payload is required.');
	}

	$address = byda_iet_validate_address(isset($payload['address']) ? $payload['address'] : null);
	if (is_wp_error($address)) {
		return $address;
	}

	$resolved_site = null;
	if (!empty($payload['resolvedSite'])) {
		$resolved_site = byda_iet_validate_resolved_site($payload['resolvedSite']);
		if (is_wp_error($resolved_site)) {
			return $resolved_site;
		}
	}

	$dig_start_at = isset($payload['digStartAt']) ? (string) $payload['digStartAt'] : '';
	$dig_end_at = isset($payload['digEndAt']) ? (string) $payload['digEndAt'] : '';
	if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dig_start_at) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dig_end_at)) {
		return byda_iet_bad_request('digStartAt and digEndAt must use YYYY-MM-DD.');
	}
	if ($dig_end_at < $dig_start_at) {
		return byda_iet_bad_request('digEndAt must be on or after digStartAt.');
	}

	$activity_types = isset($payload['activityTypes']) && is_array($payload['activityTypes']) ? array_values(array_filter($payload['activityTypes'])) : array();
	if (empty($activity_types)) {
		return byda_iet_bad_request('activityTypes must contain at least one value.');
	}

	$location_types = isset($payload['locationTypes']) && is_array($payload['locationTypes']) ? array_values(array_filter($payload['locationTypes'])) : array();
	if (empty($location_types)) {
		return byda_iet_bad_request('locationTypes must contain at least one value.');
	}
	foreach ($location_types as $location_type) {
		if (!in_array($location_type, array('Road Reserve', 'Private'), true)) {
			return byda_iet_bad_request('locationTypes may only contain Road Reserve or Private.');
		}
	}

	$locations_in_road = isset($payload['locationsInRoad']) && is_array($payload['locationsInRoad']) ? array_values(array_filter($payload['locationsInRoad'])) : array();
	if (in_array('Road Reserve', $location_types, true) && empty($locations_in_road)) {
		return byda_iet_bad_request('locationsInRoad is required when Road Reserve is selected.');
	}

	$authority_id = isset($payload['authorityId']) && '' !== $payload['authorityId'] ? (int) $payload['authorityId'] : null;
	$other_authority_name = trim((string) (isset($payload['otherAuthorityName']) ? $payload['otherAuthorityName'] : ''));
	if ($authority_id && '' !== $other_authority_name) {
		return byda_iet_bad_request('Provide either authorityId or otherAuthorityName, not both.');
	}

	$user_reference = trim((string) (isset($payload['userReference']) ? $payload['userReference'] : ''));
	$notes = trim((string) (isset($payload['notes']) ? $payload['notes'] : ''));
	$user_timezone = trim((string) (isset($payload['userTimezone']) ? $payload['userTimezone'] : ''));

	return array(
		'address' => $address,
		'resolvedSite' => $resolved_site,
		'userReference' => '' !== $user_reference ? substr($user_reference, 0, 100) : null,
		'digStartAt' => $dig_start_at,
		'digEndAt' => $dig_end_at,
		'isPlanningJob' => !empty($payload['isPlanningJob']),
		'activityTypes' => $activity_types,
		'locationTypes' => $location_types,
		'locationsInRoad' => $locations_in_road,
		'authorityId' => $authority_id ? $authority_id : null,
		'otherAuthorityName' => '' !== $other_authority_name ? substr($other_authority_name, 0, 100) : null,
		'notes' => '' !== $notes ? substr($notes, 0, 500) : null,
		'userTimezone' => '' !== $user_timezone ? substr($user_timezone, 0, 64) : null,
		'isSandboxTest' => !empty($payload['isSandboxTest']),
	);
}
