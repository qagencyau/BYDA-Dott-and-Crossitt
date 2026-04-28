<?php

defined('ABSPATH') || exit;

function byda_iet_get_mock_options() {
	return array(
		'planning' => array(
			array('code' => 'CONCEPTUAL_DESIGN', 'label' => 'Conceptual Design'),
			array('code' => 'ENGINEERING_DESIGN', 'label' => 'Engineering Design'),
		),
		'excavation' => array(
			array('code' => 'MANUAL_EXCAVATION', 'label' => 'Manual Excavation'),
			array('code' => 'HORIZ_BORING', 'label' => 'Horizontal Boring'),
			array('code' => 'VACUUM_EXCAVATION', 'label' => 'Vacuum Excavation'),
		),
	);
}

function byda_iet_get_options_payload($settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	$mock_options = byda_iet_get_mock_options();

	if (!empty($settings['byda_use_mock'])) {
		return array(
			'mode' => 'mock',
			'optionsSource' => 'mock',
			'planningActivityTypes' => $mock_options['planning'],
			'excavationActivityTypes' => $mock_options['excavation'],
			'locationTypes' => array('Road Reserve', 'Private'),
			'locationsInRoad' => array('Road', 'Nature Strip', 'Footpath'),
			'byda' => array(
				'mode' => 'mock',
				'proxy' => 'poller',
			),
		);
	}

	if (function_exists('byda_iet_external_poller_proxy_is_enabled') && byda_iet_external_poller_proxy_is_enabled($settings)) {
		$options = byda_iet_external_poller_get_options($settings);
		if (!is_wp_error($options) && is_array($options)) {
			return $options;
		}

		return $options;
	}

	return new WP_Error(
		'byda_iet_poller_required',
		'Live BYDA options require the external poller. Configure the poller base URL and shared secret, or use mock mode.',
		array('status' => 500)
	);
}

function byda_iet_list_authorities($site, $settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	if (!empty($settings['byda_use_mock'])) {
		return array();
	}

	if (function_exists('byda_iet_external_poller_proxy_is_enabled') && byda_iet_external_poller_proxy_is_enabled($settings)) {
		$response = byda_iet_external_poller_get_organisations($site, $settings);
		if (!is_wp_error($response) && isset($response['organisations']) && is_array($response['organisations'])) {
			return $response['organisations'];
		}

		return array();
	}

	return array();
}

function byda_iet_resolve_site($input, $settings = null) {
	if (!empty($input['resolvedSite']) && is_array($input['resolvedSite'])) {
		$enriched = byda_iet_enrich_site($input['resolvedSite'], $settings);
		return is_wp_error($enriched) ? $input['resolvedSite'] : $enriched;
	}

	$matches = byda_iet_search_addresses(isset($input['address']) ? $input['address'] : array(), $settings);
	if (is_wp_error($matches)) {
		return $matches;
	}

	$first_match = isset($matches[0]) ? $matches[0] : null;
	if (!$first_match) {
		return new WP_Error('byda_iet_address_not_found', 'Address could not be resolved.');
	}

	$enriched = byda_iet_enrich_site($first_match, $settings);
	return is_wp_error($enriched) ? $first_match : $enriched;
}

function byda_iet_build_byda_payload($input, $site) {
	$location_types = isset($input['locationTypes']) && is_array($input['locationTypes']) ? array_values($input['locationTypes']) : array();
	$locations_in_road = in_array('Road Reserve', $location_types, true) && !empty($input['locationsInRoad']) && is_array($input['locationsInRoad'])
		? array_values($input['locationsInRoad'])
		: array();

	return array(
		'userReference' => !empty($input['userReference']) ? $input['userReference'] : null,
		'digStartAt' => $input['digStartAt'],
		'digEndAt' => $input['digEndAt'],
		'shape' => $site['polygon'],
		'isPlanningJob' => !empty($input['isPlanningJob']),
		'activityTypes' => array_values($input['activityTypes']),
		'authorityId' => isset($input['authorityId']) ? $input['authorityId'] : null,
		'otherAuthorityName' => !empty($input['otherAuthorityName']) ? $input['otherAuthorityName'] : null,
		'notes' => !empty($input['notes']) ? $input['notes'] : null,
		'locationTypes' => $location_types,
		'locationsInRoad' => $locations_in_road,
		'source' => 'API',
		'isSandboxTest' => !empty($input['isSandboxTest']) ? true : null,
		'Address' => array(
			'line1' => trim($input['address']['streetNumber'] . ' ' . $input['address']['streetName']),
			'line2' => null,
			'locality' => $input['address']['suburb'],
			'state' => $input['address']['state'],
			'country' => 'AUS',
			'postcode' => (int) $input['address']['postcode'],
		),
		'userTimezone' => !empty($input['userTimezone']) ? $input['userTimezone'] : 'Australia/Sydney',
	);
}

function byda_iet_create_enquiry($input, $settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	byda_iet_log(
		'Create enquiry service started.',
		array(
			'mockMode' => !empty($settings['byda_use_mock']),
			'pollerEnabled' => function_exists('byda_iet_external_poller_proxy_is_enabled') ? byda_iet_external_poller_proxy_is_enabled($settings) : false,
			'address' => isset($input['address']) ? $input['address'] : null,
			'userReference' => isset($input['userReference']) ? $input['userReference'] : null,
			'digStartAt' => isset($input['digStartAt']) ? $input['digStartAt'] : null,
			'digEndAt' => isset($input['digEndAt']) ? $input['digEndAt'] : null,
			'hasResolvedSite' => !empty($input['resolvedSite']),
		),
		'debug'
	);
	$site = byda_iet_resolve_site($input, $settings);
	if (is_wp_error($site)) {
		byda_iet_log_wp_error(
			'Create enquiry service could not resolve site.',
			$site,
			array(
				'address' => isset($input['address']) ? $input['address'] : null,
			)
		);
		return $site;
	}

	byda_iet_log(
		'Create enquiry service resolved site.',
		array(
			'siteId' => isset($site['id']) ? $site['id'] : null,
			'label' => isset($site['label']) ? $site['label'] : null,
			'source' => isset($site['source']) ? $site['source'] : null,
			'state' => isset($site['state']) ? $site['state'] : null,
			'hasPolygon' => !empty($site['polygon']),
		),
		'debug'
	);

	$now = byda_iet_now_iso8601();
	$token = wp_generate_uuid4();

	if (!empty($settings['byda_use_mock'])) {
		$record = array(
			'token' => $token,
			'mode' => 'mock',
			'status' => 'processing',
			'message' => 'Mock enquiry created. A sample report will be available shortly.',
			'createdAt' => $now,
			'updatedAt' => $now,
			'bydaEnquiryId' => time(),
			'bydaExternalId' => time(),
			'bydaStatus' => 'CREATED',
			'input' => $input,
			'site' => $site,
			'pollFailures' => 0,
			'entryId' => null,
			'gfFormId' => isset($settings['gf_form_id']) ? absint($settings['gf_form_id']) : 0,
			'gfReportUrlFieldId' => isset($settings['gf_report_url_field_id']) ? trim((string) $settings['gf_report_url_field_id']) : '',
			'reportUrl' => null,
			'pollerProvider' => null,
			'pollerStatus' => null,
			'pollerJobIds' => array(),
			'pollerStartedAt' => null,
			'pollerLastCallbackAt' => null,
			'pollerLastError' => null,
		);

		byda_iet_create_enquiry_record($record);
		byda_iet_schedule_refresh_event($token, 8);
		byda_iet_log(
			'Create enquiry service created mock record.',
			array(
				'record' => byda_iet_debug_record_summary($record),
			),
			'debug'
		);
		return $record;
	}

	if (!function_exists('byda_iet_external_poller_proxy_is_enabled') || !byda_iet_external_poller_proxy_is_enabled($settings)) {
		byda_iet_log(
			'Create enquiry service cannot continue because live poller is disabled.',
			array(
				'token' => $token,
				'hasPollerFunction' => function_exists('byda_iet_external_poller_proxy_is_enabled'),
				'mockMode' => !empty($settings['byda_use_mock']),
			),
			'warning'
		);
		return new WP_Error(
			'byda_iet_poller_required',
			'Live BYDA enquiries require the external poller. Configure the poller base URL and shared secret, or use mock mode.',
			array('status' => 500)
		);
	}

	$payload = byda_iet_build_byda_payload($input, $site);
	$record = array(
		'token' => $token,
		'mode' => 'live',
		'status' => 'processing',
		'message' => 'Enquiry lodged with BYDA. Waiting for combined report generation.',
		'createdAt' => $now,
		'updatedAt' => $now,
		'bydaEnquiryId' => null,
		'bydaExternalId' => null,
		'bydaStatus' => 'CREATING',
		'input' => $input,
		'site' => $site,
		'pollFailures' => 0,
		'entryId' => null,
		'gfFormId' => isset($settings['gf_form_id']) ? absint($settings['gf_form_id']) : 0,
		'gfReportUrlFieldId' => isset($settings['gf_report_url_field_id']) ? trim((string) $settings['gf_report_url_field_id']) : '',
		'reportUrl' => null,
		'pollerProvider' => 'external',
		'pollerStatus' => 'starting',
		'pollerJobIds' => array(),
		'pollerStartedAt' => null,
		'pollerLastCallbackAt' => null,
		'pollerLastError' => null,
	);

	$record = byda_iet_create_enquiry_record($record);
	byda_iet_log(
		'Create enquiry service created local live record before poller submission.',
		array(
			'record' => byda_iet_debug_record_summary($record),
			'bydaPayloadSummary' => array(
				'userReference' => isset($payload['userReference']) ? $payload['userReference'] : null,
				'digStartAt' => isset($payload['digStartAt']) ? $payload['digStartAt'] : null,
				'digEndAt' => isset($payload['digEndAt']) ? $payload['digEndAt'] : null,
				'isPlanningJob' => !empty($payload['isPlanningJob']),
				'activityTypes' => isset($payload['activityTypes']) ? $payload['activityTypes'] : array(),
				'locationTypes' => isset($payload['locationTypes']) ? $payload['locationTypes'] : array(),
				'authorityId' => isset($payload['authorityId']) ? $payload['authorityId'] : null,
				'otherAuthorityName' => isset($payload['otherAuthorityName']) ? $payload['otherAuthorityName'] : null,
				'hasShape' => !empty($payload['shape']),
			),
		),
		'debug'
	);
	$created = byda_iet_external_poller_create_enquiry($record, $payload, $settings);
	if (!is_wp_error($created)) {
		byda_iet_log(
			'Create enquiry service received poller create response.',
			array(
				'token' => $token,
				'responseKeys' => is_array($created) ? array_keys($created) : null,
				'status' => is_array($created) && isset($created['status']) ? $created['status'] : null,
				'enquiryId' => is_array($created) && isset($created['enquiryId']) ? $created['enquiryId'] : null,
				'bydaStatus' => is_array($created) && isset($created['bydaStatus']) ? $created['bydaStatus'] : null,
				'jobs' => is_array($created) && isset($created['jobs']) ? $created['jobs'] : null,
			),
			'debug'
		);
		$now = byda_iet_now_iso8601();
		$created_payload = isset($created['created']) && is_array($created['created']) ? $created['created'] : array();
		$created_enquiry_id = isset($created['enquiryId']) ? $created['enquiryId'] : (isset($created_payload['id']) ? $created_payload['id'] : null);
		$created_status = isset($created['status']) ? sanitize_key((string) $created['status']) : '';
		$record = byda_iet_update_enquiry_record(
			$token,
			array(
				'status' => 'processing',
				'message' => $created_enquiry_id
					? 'Enquiry lodged with BYDA through the external poller. Waiting for combined report generation.'
					: 'External poller accepted the enquiry request. Waiting for BYDA confirmation.',
				'bydaEnquiryId' => $created_enquiry_id,
				'bydaExternalId' => isset($created['externalId']) ? $created['externalId'] : (isset($created_payload['externalId']) ? $created_payload['externalId'] : null),
				'bydaStatus' => isset($created['bydaStatus']) ? $created['bydaStatus'] : (isset($created_payload['status']) ? $created_payload['status'] : ($created_enquiry_id ? 'CREATED' : 'CREATING')),
				'pollerProvider' => 'external',
				'pollerStatus' => $created_status ? $created_status : 'started',
				'pollerJobIds' => isset($created['jobs']) && is_array($created['jobs']) ? $created['jobs'] : array(),
				'pollerStartedAt' => $now,
				'pollerLastError' => null,
				'updatedAt' => $now,
			)
		);
		byda_iet_unschedule_refresh_event($token);

		byda_iet_log(
			'Create enquiry service updated local record from poller create response.',
			array(
				'record' => byda_iet_debug_record_summary($record ? $record : byda_iet_get_enquiry_record($token)),
			),
			'debug'
		);

		return $record ? $record : byda_iet_get_enquiry_record($token);
	}

	if (byda_iet_is_ambiguous_external_poller_create_error($created)) {
		byda_iet_log(
			'External BYDA poller create response was ambiguous; keeping enquiry in processing state.',
			array(
				'token' => $token,
				'status' => byda_iet_error_status($created),
				'error' => byda_iet_error_message($created),
			),
			'warning'
		);

		$record = byda_iet_update_enquiry_record(
			$token,
			array(
				'status' => 'processing',
				'message' => 'The enquiry request was sent to the external poller. Waiting for BYDA confirmation.',
				'error' => null,
				'bydaStatus' => 'CREATING',
				'pollerStatus' => 'start_pending',
				'pollerStartedAt' => $now,
				'pollerLastError' => byda_iet_error_message($created),
				'updatedAt' => $now,
			)
		);

		byda_iet_log(
			'Create enquiry service kept ambiguous poller create error in processing state.',
			array(
				'record' => byda_iet_debug_record_summary($record ? $record : byda_iet_get_enquiry_record($token)),
			),
			'debug'
		);

		return $record ? $record : byda_iet_get_enquiry_record($token);
	}

	byda_iet_log(
		'External BYDA poller failed to create the enquiry.',
		array(
			'token' => $token,
			'error' => byda_iet_error_message($created),
		),
		'warning'
	);

	$record = byda_iet_update_enquiry_record(
		$token,
		array(
			'status' => 'failed',
			'message' => 'The external poller could not lodge the BYDA enquiry.',
			'error' => byda_iet_error_message($created),
			'pollerStatus' => 'create_failed',
			'pollerLastError' => byda_iet_error_message($created),
			'updatedAt' => $now,
		)
	);
	byda_iet_unschedule_refresh_event($token);

	byda_iet_log(
		'Create enquiry service marked local record failed after poller create error.',
		array(
			'record' => byda_iet_debug_record_summary($record ? $record : byda_iet_get_enquiry_record($token)),
		),
		'debug'
	);

	return $record ? $record : byda_iet_get_enquiry_record($token);
}

function byda_iet_is_ambiguous_external_poller_create_error($error) {
	if (!is_wp_error($error)) {
		return false;
	}

	$status = byda_iet_error_status($error);
	if (!$status) {
		return true;
	}

	return !in_array($status, array(400, 401, 403, 404, 422), true);
}

function byda_iet_is_all_received_status($status) {
	return 'ALL_RECEIVED' === strtoupper(trim((string) $status));
}

function byda_iet_can_request_combined_report($byda_status, $combined_file_id = null, $combined_job_id = null, $allow_partial = false) {
	return byda_iet_is_all_received_status($byda_status) || !empty($combined_file_id) || !empty($combined_job_id) || $allow_partial;
}

function byda_iet_build_live_report_message($file_url, $share_url, $byda_status = null) {
	if ($file_url && byda_iet_is_all_received_status($byda_status)) {
		return 'Combined BYDA report is ready.';
	}

	if ($file_url) {
		return 'Partial BYDA report is available while responses are still arriving.';
	}

	if (byda_iet_is_all_received_status($byda_status)) {
		return $share_url
			? 'All responses have been received. Waiting for the combined BYDA report download link.'
			: 'All responses have been received. Waiting for the combined BYDA report download link.';
	}

	if ($share_url) {
		return 'Enquiry lodged. BYDA share link available while the combined report is still processing.';
	}

	return 'Enquiry lodged. Waiting for combined BYDA report generation.';
}

function byda_iet_resolve_display_status($tracking_status, $byda_status = null) {
	$tracking_status = trim((string) $tracking_status);
	$byda_status = trim((string) $byda_status);
	$tracking_normalized = strtolower($tracking_status);

	if (in_array($tracking_normalized, array('ready', 'failed'), true)) {
		return $tracking_status;
	}

	if ('' !== $byda_status && !in_array($tracking_normalized, array('', 'processing', 'polling', 'started', 'starting'), true)) {
		return $tracking_status;
	}

	return '' !== $byda_status ? $byda_status : ('' !== $tracking_status ? $tracking_status : 'unknown');
}

function byda_iet_refresh_enquiry_record($token, $force = false, $settings = null) {
	$record = byda_iet_get_enquiry_record($token);
	if (!$record) {
		return null;
	}

	$status = isset($record['status']) ? strtolower((string) $record['status']) : '';
	if (in_array($status, array('ready', 'failed'), true)) {
		return $record;
	}

	if ('mock' === (isset($record['mode']) ? $record['mode'] : '')) {
		return byda_iet_refresh_mock_enquiry_record($record);
	}

	return $record;
}

function byda_iet_refresh_mock_enquiry_record($record) {
	$created_at = byda_iet_to_timestamp(isset($record['createdAt']) ? $record['createdAt'] : null);
	if (!$created_at || (time() - $created_at) < 8) {
		return $record;
	}

	return byda_iet_update_enquiry_record(
		$record['token'],
		static function ($current) {
			$now = byda_iet_now_iso8601();
			$current['status'] = 'ready';
			$current['pollFailures'] = 0;
			$current['message'] = 'Mock report is ready.';
			$current['fileUrl'] = rest_url('byda-iet/v1/mock-reports/' . rawurlencode($current['token']));
			$current['error'] = null;
			$current['updatedAt'] = $now;
			$current['lastPolledAt'] = $now;
			return $current;
		}
	);
}

function byda_iet_get_enquiry_status_record($token, $settings = null) {
	$record = byda_iet_get_enquiry_record($token);
	if (!$record) {
		byda_iet_log(
			'Status record lookup missed local store.',
			array(
				'token' => $token,
			),
			'warning'
		);
		return null;
	}

	byda_iet_log(
		'Status record lookup loaded local record.',
		array(
			'record' => byda_iet_debug_record_summary($record),
		),
		'debug'
	);

	$status = isset($record['status']) ? strtolower((string) $record['status']) : '';
	if ('failed' === $status && byda_iet_should_reconcile_poller_create_record($record)) {
		byda_iet_log(
			'Status record lookup attempting failed-create reconciliation.',
			array(
				'record' => byda_iet_debug_record_summary($record),
			),
			'debug'
		);
		$record = byda_iet_reconcile_poller_create_record($record, $settings);
		$status = isset($record['status']) ? strtolower((string) $record['status']) : '';
	}

	if (in_array($status, array('ready', 'failed'), true)) {
		byda_iet_log(
			'Status record lookup returning terminal record.',
			array(
				'record' => byda_iet_debug_record_summary($record),
			),
			'debug'
		);
		return $record;
	}

	if ('live' === (isset($record['mode']) ? $record['mode'] : 'live')) {
		byda_iet_log(
			'Status record lookup returning live record without local refresh; waiting for external callback.',
			array(
				'record' => byda_iet_debug_record_summary($record),
			),
			'debug'
		);
		return $record;
	}

	$last_polled = byda_iet_to_timestamp(isset($record['lastPolledAt']) ? $record['lastPolledAt'] : null);
	$stale_after = max(5, byda_iet_get_poll_interval_seconds());

	if (!$last_polled || (time() - $last_polled) >= $stale_after) {
		byda_iet_log(
			'Status record lookup refreshing stale mock record.',
			array(
				'token' => $token,
				'lastPolledAt' => isset($record['lastPolledAt']) ? $record['lastPolledAt'] : null,
				'staleAfterSeconds' => $stale_after,
			),
			'debug'
		);
		$record = byda_iet_refresh_enquiry_record($token, true, $settings);
	}

	byda_iet_log(
		'Status record lookup returning refreshed record.',
		array(
			'record' => byda_iet_debug_record_summary($record),
		),
		'debug'
	);

	return $record;
}

function byda_iet_should_reconcile_poller_create_record($record) {
	if (!is_array($record)) {
		return false;
	}

	if ('live' !== (isset($record['mode']) ? $record['mode'] : 'live')) {
		return false;
	}
	if (empty($record['pollerProvider']) || 'external' !== $record['pollerProvider']) {
		return false;
	}
	if (!empty($record['bydaEnquiryId'])) {
		return false;
	}
	if (empty($record['input']['userReference'])) {
		return false;
	}

	$poller_status = strtolower(trim((string) (isset($record['pollerStatus']) ? $record['pollerStatus'] : '')));
	return in_array($poller_status, array('create_failed', 'start_pending', 'starting'), true);
}

function byda_iet_reconcile_poller_create_record($record, $settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	if (!function_exists('byda_iet_external_poller_proxy_is_enabled') || !byda_iet_external_poller_proxy_is_enabled($settings)) {
		return $record;
	}

	$user_reference = trim((string) (isset($record['input']['userReference']) ? $record['input']['userReference'] : ''));
	if ('' === $user_reference) {
		return $record;
	}

	$created_at = byda_iet_to_timestamp(isset($record['createdAt']) ? $record['createdAt'] : null);
	$created_after = $created_at ? gmdate('Y-m-d', max(0, $created_at - 86400)) : null;
	$remote_result = byda_iet_external_poller_search_enquiries(
		array(
			'limit' => 100,
			'createdAfter' => $created_after,
		),
		$settings
	);

	if (is_wp_error($remote_result) || empty($remote_result['enquiries']) || !is_array($remote_result['enquiries'])) {
		return $record;
	}

	foreach ($remote_result['enquiries'] as $remote_record) {
		if ($user_reference !== trim((string) (isset($remote_record['userReference']) ? $remote_record['userReference'] : ''))) {
			continue;
		}

		$now = byda_iet_now_iso8601();
		$updated = byda_iet_update_enquiry_record(
			$record['token'],
			array(
				'status' => 'processing',
				'message' => 'BYDA enquiry was found after the poller create response timed out. Waiting for combined report generation.',
				'bydaEnquiryId' => !empty($remote_record['enquiryId']) ? $remote_record['enquiryId'] : null,
				'bydaExternalId' => !empty($remote_record['externalId']) ? $remote_record['externalId'] : null,
				'bydaStatus' => !empty($remote_record['bydaStatus']) ? $remote_record['bydaStatus'] : 'CREATED',
				'pollerStatus' => 'recovered',
				'pollerLastError' => null,
				'error' => null,
				'updatedAt' => $now,
				'lastPolledAt' => $now,
			)
		);

		return $updated ? $updated : byda_iet_get_enquiry_record($record['token']);
	}

	return $record;
}

function byda_iet_find_enquiries_by_address($args = array(), $settings = null) {
	$source = isset($args['source']) ? $args['source'] : 'all';
	$limit = isset($args['limit']) ? max(1, (int) $args['limit']) : 6;
	$created_after = isset($args['createdAfter']) ? $args['createdAfter'] : null;
	$address = isset($args['address']) ? $args['address'] : array();
	$wants_local = in_array($source, array('local', 'all'), true);
	$uses_poller_proxy = function_exists('byda_iet_external_poller_proxy_is_enabled') && byda_iet_external_poller_proxy_is_enabled($settings);
	$wants_byda = in_array($source, array('byda', 'all'), true) && $uses_poller_proxy;
	$local_records = $wants_local ? byda_iet_list_local_enquiry_records() : array();
	$remote_records = array();

	if ($wants_byda) {
		$search_args = array(
			'limit' => max($limit * 5, 50),
			'createdAfter' => $created_after,
		);
		$remote_result = byda_iet_external_poller_search_enquiries($search_args, $settings);
		if (!is_wp_error($remote_result)) {
			$remote_records = isset($remote_result['enquiries']) ? $remote_result['enquiries'] : array();
		}
	}

	$matched_local = $wants_local
		? array_values(
			array_filter(
				$local_records,
				static function ($record) use ($address) {
					return byda_iet_matches_local_record_address($record, $address);
				}
			)
		)
		: array();
	$matched_remote = array_values(
		array_filter(
			$remote_records,
			static function ($record) use ($address) {
				return byda_iet_matches_remote_record_address($record, $address);
			}
		)
	);
	$merged = byda_iet_merge_history_records($matched_local, $matched_remote);

	return array(
		'enquiries' => array_slice($merged, 0, $limit),
		'total' => count($merged),
	);
}

function byda_iet_merge_history_records($local_records = array(), $remote_records = array(), $limit = null, $settings = null) {
	$local_records_by_enquiry_id = array();
	$matched_tokens = array();
	$enquiries = array();

	foreach ($local_records as $record) {
		if (!empty($record['bydaEnquiryId'])) {
			$local_records_by_enquiry_id[(string) $record['bydaEnquiryId']] = $record;
		}
	}

	foreach ($remote_records as $remote) {
		$local = byda_iet_find_matching_local_record($local_records, $local_records_by_enquiry_id, $matched_tokens, $remote);

		if ($local) {
			$matched_tokens[$local['token']] = true;
			$linked_local = byda_iet_link_remote_identifiers($local, $remote);
			if (!empty($linked_local['bydaEnquiryId'])) {
				$local_records_by_enquiry_id[(string) $linked_local['bydaEnquiryId']] = $linked_local;
			}

			$enquiries[] = byda_iet_merge_history_item($linked_local, $remote);
			continue;
		}

		$enquiries[] = byda_iet_to_remote_history_item($remote);
	}

	foreach ($local_records as $local) {
		if (isset($matched_tokens[$local['token']])) {
			continue;
		}

		$enquiries[] = byda_iet_to_local_history_item($local);
	}

	usort(
		$enquiries,
		static function ($left, $right) {
			return byda_iet_compare_iso_dates(isset($right['createdAt']) ? $right['createdAt'] : null, isset($left['createdAt']) ? $left['createdAt'] : null);
		}
	);

	return null === $limit ? $enquiries : array_slice($enquiries, 0, $limit);
}

function byda_iet_get_remote_enquiry_status_via_poller($enquiry_id, $settings = null) {
	$status = byda_iet_external_poller_get_enquiry_status($enquiry_id, $settings);
	if (is_wp_error($status)) {
		return $status;
	}

	$local_record = byda_iet_find_local_record_for_remote(
		array(
			'enquiryId' => isset($status['enquiryId']) ? $status['enquiryId'] : $enquiry_id,
			'externalId' => isset($status['externalId']) ? $status['externalId'] : null,
			'userReference' => isset($status['userReference']) ? $status['userReference'] : null,
			'createdAt' => isset($status['createdAt']) ? $status['createdAt'] : null,
			'updatedAt' => isset($status['updatedAt']) ? $status['updatedAt'] : null,
			'bydaStatus' => isset($status['bydaStatus']) ? $status['bydaStatus'] : null,
		)
	);
	$file_url = !empty($status['fileUrl']) ? $status['fileUrl'] : null;
	$share_url = !empty($status['shareUrl']) ? $status['shareUrl'] : null;
	$byda_status = !empty($status['bydaStatus']) ? $status['bydaStatus'] : null;
	$report_finalized = !empty($status['reportFinalized']);
	$local_status = !empty($local_record['status']) ? strtolower((string) $local_record['status']) : '';
	$tracking_status = 'failed' === $local_status ? 'failed' : ($report_finalized && $file_url ? 'ready' : 'processing');
	$display_status = byda_iet_resolve_display_status($tracking_status, $byda_status);

	$result = array(
		'source' => $local_record ? 'both' : 'byda',
		'token' => $local_record ? $local_record['token'] : null,
		'trackingToken' => $local_record ? $local_record['token'] : null,
		'mode' => $local_record ? $local_record['mode'] : 'live',
		'status' => $tracking_status,
		'trackingStatus' => $tracking_status,
		'displayStatus' => $display_status,
		'message' => $local_record ? $local_record['message'] : byda_iet_build_remote_status_message($file_url, $share_url, $byda_status),
		'enquiryId' => isset($status['enquiryId']) ? $status['enquiryId'] : $enquiry_id,
		'externalId' => isset($status['externalId']) ? $status['externalId'] : (!empty($local_record['bydaExternalId']) ? $local_record['bydaExternalId'] : null),
		'bydaStatus' => $byda_status,
		'readyUrl' => $file_url ? $file_url : $share_url,
		'fileUrl' => $file_url,
		'sourceFileUrl' => !empty($status['sourceFileUrl']) ? $status['sourceFileUrl'] : null,
		'storageKey' => !empty($status['storageKey']) ? $status['storageKey'] : null,
		'fileUrlExpiresAt' => !empty($status['fileUrlExpiresAt']) ? $status['fileUrlExpiresAt'] : null,
		'reportFinalized' => $report_finalized,
		'reportFinalizedAt' => !empty($status['reportFinalizedAt']) ? $status['reportFinalizedAt'] : null,
		'shareUrl' => $share_url,
		'error' => !empty($local_record['error']) ? $local_record['error'] : null,
		'site' => !empty($local_record['site']) ? $local_record['site'] : null,
		'addressLabel' => !empty($status['addressLabel']) ? $status['addressLabel'] : (!empty($local_record['site']['label']) ? $local_record['site']['label'] : null),
		'userReference' => isset($status['userReference']) ? $status['userReference'] : (!empty($local_record['input']['userReference']) ? $local_record['input']['userReference'] : null),
		'createdAt' => isset($status['createdAt']) ? $status['createdAt'] : (!empty($local_record['createdAt']) ? $local_record['createdAt'] : null),
		'updatedAt' => isset($status['updatedAt']) ? $status['updatedAt'] : (!empty($local_record['updatedAt']) ? $local_record['updatedAt'] : null),
		'lastPolledAt' => !empty($local_record['lastPolledAt']) ? $local_record['lastPolledAt'] : null,
	);

	if ($local_record && !empty($local_record['token'])) {
		$updated = byda_iet_update_enquiry_record(
			$local_record['token'],
			static function ($current) use ($status, $file_url, $share_url, $byda_status, $report_finalized) {
				$now = byda_iet_now_iso8601();
				$current['status'] = $report_finalized && $file_url ? 'ready' : ('failed' === (isset($current['status']) ? $current['status'] : '') ? 'failed' : 'processing');
				$current['message'] = byda_iet_build_live_report_message($file_url, $share_url, $byda_status);
				$current['shareUrl'] = $share_url ? $share_url : (isset($current['shareUrl']) ? $current['shareUrl'] : null);
				$current['fileUrl'] = $file_url ? $file_url : (isset($current['fileUrl']) ? $current['fileUrl'] : null);
				$current['sourceFileUrl'] = !empty($status['sourceFileUrl']) ? $status['sourceFileUrl'] : (isset($current['sourceFileUrl']) ? $current['sourceFileUrl'] : null);
				$current['storageKey'] = !empty($status['storageKey']) ? $status['storageKey'] : (isset($current['storageKey']) ? $current['storageKey'] : null);
				$current['fileUrlExpiresAt'] = !empty($status['fileUrlExpiresAt']) ? $status['fileUrlExpiresAt'] : (isset($current['fileUrlExpiresAt']) ? $current['fileUrlExpiresAt'] : null);
				if ($report_finalized) {
					$current['reportFinalized'] = true;
					$current['reportFinalizedAt'] = !empty($status['reportFinalizedAt']) ? $status['reportFinalizedAt'] : $now;
				}
				$current['combinedFileId'] = !empty($status['combinedFileId']) ? $status['combinedFileId'] : (isset($current['combinedFileId']) ? $current['combinedFileId'] : null);
				$current['combinedJobId'] = !empty($status['combinedJobId']) ? $status['combinedJobId'] : (isset($current['combinedJobId']) ? $current['combinedJobId'] : null);
				$current['bydaStatus'] = $byda_status ? $byda_status : (isset($current['bydaStatus']) ? $current['bydaStatus'] : null);
				$current['updatedAt'] = $now;
				$current['lastPolledAt'] = $now;
				return $current;
			}
		);

		if ($updated && function_exists('byda_iet_sync_report_url_to_entry')) {
			byda_iet_sync_report_url_to_entry($updated, $settings);
		}
	}

	return $result;
}

function byda_iet_get_remote_enquiry_status($enquiry_id, $settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	if (!empty($settings['byda_use_mock'])) {
		return new WP_Error('byda_iet_mock_mode', 'BYDA live history is unavailable while mock mode is enabled.');
	}

	if (function_exists('byda_iet_external_poller_proxy_is_enabled') && byda_iet_external_poller_proxy_is_enabled($settings)) {
		return byda_iet_get_remote_enquiry_status_via_poller($enquiry_id, $settings);
	}

	return new WP_Error(
		'byda_iet_poller_required',
		'Live BYDA enquiry status requires the external poller. Configure the poller base URL and shared secret, or use mock mode.',
		array('status' => 500)
	);
}

function byda_iet_get_enquiry_report_url($args = array(), $settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	$token = !empty($args['token']) ? (string) $args['token'] : null;
	$enquiry_id = !empty($args['enquiryId']) ? $args['enquiryId'] : null;
	$local_record = $token
		? byda_iet_get_enquiry_record($token)
		: ($enquiry_id ? byda_iet_find_enquiry_by_byda_id($enquiry_id) : null);

	byda_iet_log(
		'Report URL resolution started.',
		array(
			'token' => $token,
			'enquiryId' => $enquiry_id,
			'localRecord' => byda_iet_debug_record_summary($local_record),
			'mockMode' => !empty($settings['byda_use_mock']),
		),
		'debug'
	);

	if ($token && !$local_record) {
		byda_iet_log(
			'Report URL resolution stopped because token has no local record.',
			array(
				'token' => $token,
			),
			'warning'
		);
		return null;
	}

	if ($local_record && 'mock' === (isset($local_record['mode']) ? $local_record['mode'] : '')) {
		return rest_url('byda-iet/v1/mock-reports/' . rawurlencode($local_record['token']));
	}

	if (!empty($settings['byda_use_mock'])) {
		if (!empty($local_record['shareUrl'])) {
			return $local_record['shareUrl'];
		}
		return !empty($local_record['fileUrl']) ? $local_record['fileUrl'] : null;
	}

	$resolved_enquiry_id = $enquiry_id ? $enquiry_id : (!empty($local_record['bydaEnquiryId']) ? $local_record['bydaEnquiryId'] : null);
	if (
		$resolved_enquiry_id &&
		function_exists('byda_iet_external_poller_proxy_is_enabled') &&
		byda_iet_external_poller_proxy_is_enabled($settings)
	) {
		$report = byda_iet_external_poller_get_enquiry_report($resolved_enquiry_id, $settings, is_array($local_record) ? $local_record : array());
		if (!is_wp_error($report)) {
			byda_iet_log(
				'Report URL resolution received poller report response.',
				array(
					'token' => $token,
					'enquiryId' => $resolved_enquiry_id,
					'responseKeys' => is_array($report) ? array_keys($report) : null,
					'status' => is_array($report) && isset($report['status']) ? $report['status'] : null,
					'bydaStatus' => is_array($report) && isset($report['bydaStatus']) ? $report['bydaStatus'] : null,
					'fileUrl' => byda_iet_debug_url_summary(isset($report['fileUrl']) ? $report['fileUrl'] : ''),
					'shareUrl' => byda_iet_debug_url_summary(isset($report['shareUrl']) ? $report['shareUrl'] : ''),
					'reportUrl' => byda_iet_debug_url_summary(isset($report['reportUrl']) ? $report['reportUrl'] : ''),
				),
				'debug'
			);
			$file_url = !empty($report['fileUrl']) ? $report['fileUrl'] : null;
			$share_url = !empty($report['shareUrl']) ? $report['shareUrl'] : null;
			$report_finalized = !empty($report['reportFinalized']);
			$report_url = !empty($report['reportUrl']) ? $report['reportUrl'] : ($file_url ? $file_url : $share_url);

			if ($local_record && !empty($local_record['token'])) {
				$updated = byda_iet_update_enquiry_record(
					$local_record['token'],
					static function ($current) use ($report, $file_url, $share_url, $report_finalized) {
						$now = byda_iet_now_iso8601();
						$current['status'] = $report_finalized && $file_url ? 'ready' : ('failed' === (isset($current['status']) ? $current['status'] : '') ? 'failed' : 'processing');
						$current['message'] = byda_iet_build_live_report_message($file_url, $share_url, !empty($report['bydaStatus']) ? $report['bydaStatus'] : null);
						$current['shareUrl'] = $share_url ? $share_url : (isset($current['shareUrl']) ? $current['shareUrl'] : null);
						$current['fileUrl'] = $file_url ? $file_url : (isset($current['fileUrl']) ? $current['fileUrl'] : null);
						$current['sourceFileUrl'] = !empty($report['sourceFileUrl']) ? $report['sourceFileUrl'] : (isset($current['sourceFileUrl']) ? $current['sourceFileUrl'] : null);
						$current['storageKey'] = !empty($report['storageKey']) ? $report['storageKey'] : (isset($current['storageKey']) ? $current['storageKey'] : null);
						$current['fileUrlExpiresAt'] = !empty($report['fileUrlExpiresAt']) ? $report['fileUrlExpiresAt'] : (isset($current['fileUrlExpiresAt']) ? $current['fileUrlExpiresAt'] : null);
						if ($report_finalized) {
							$current['reportFinalized'] = true;
							$current['reportFinalizedAt'] = !empty($report['reportFinalizedAt']) ? $report['reportFinalizedAt'] : $now;
						}
						$current['combinedFileId'] = !empty($report['combinedFileId']) ? $report['combinedFileId'] : (isset($current['combinedFileId']) ? $current['combinedFileId'] : null);
						$current['combinedJobId'] = !empty($report['combinedJobId']) ? $report['combinedJobId'] : (isset($current['combinedJobId']) ? $current['combinedJobId'] : null);
						$current['bydaStatus'] = !empty($report['bydaStatus']) ? $report['bydaStatus'] : (isset($current['bydaStatus']) ? $current['bydaStatus'] : null);
						$current['updatedAt'] = $now;
						$current['lastPolledAt'] = $now;
						return $current;
					}
				);

				if ($updated && function_exists('byda_iet_sync_report_url_to_entry')) {
					byda_iet_sync_report_url_to_entry($updated, $settings);
				}

				byda_iet_log(
					'Report URL resolution updated local record from poller report response.',
					array(
						'record' => byda_iet_debug_record_summary($updated ? $updated : byda_iet_get_enquiry_record($local_record['token'])),
					),
					'debug'
				);
			}

			if ($report_url) {
				byda_iet_log(
					'Report URL resolution returning poller URL.',
					array(
						'token' => $token,
						'enquiryId' => $resolved_enquiry_id,
						'reportUrl' => byda_iet_debug_url_summary($report_url),
					),
					'debug'
				);
				return $report_url;
			}
		} else {
			byda_iet_log_wp_error(
				'Report URL resolution poller report request failed.',
				$report,
				array(
					'token' => $token,
					'enquiryId' => $resolved_enquiry_id,
				)
			);
		}
	}

	if (!$resolved_enquiry_id) {
		if (!empty($local_record['shareUrl'])) {
			return $local_record['shareUrl'];
		}
		return !empty($local_record['fileUrl']) ? $local_record['fileUrl'] : null;
	}

	if (!empty($local_record['fileUrl'])) {
		byda_iet_log(
			'Report URL resolution returning local file URL fallback.',
			array(
				'token' => $token,
				'enquiryId' => $resolved_enquiry_id,
				'fileUrl' => byda_iet_debug_url_summary($local_record['fileUrl']),
			),
			'debug'
		);
		return $local_record['fileUrl'];
	}
	if (!empty($local_record['shareUrl'])) {
		byda_iet_log(
			'Report URL resolution returning local share URL fallback.',
			array(
				'token' => $token,
				'enquiryId' => $resolved_enquiry_id,
				'shareUrl' => byda_iet_debug_url_summary($local_record['shareUrl']),
			),
			'debug'
		);
		return $local_record['shareUrl'];
	}

	byda_iet_log(
		'Report URL resolution found no usable URL.',
		array(
			'token' => $token,
			'enquiryId' => $resolved_enquiry_id,
			'localRecord' => byda_iet_debug_record_summary($local_record),
		),
		'warning'
	);
	return null;
}

function byda_iet_to_local_history_item($record) {
	$display_status = byda_iet_resolve_display_status(
		isset($record['status']) ? $record['status'] : '',
		!empty($record['bydaStatus']) ? $record['bydaStatus'] : null
	);

	return array(
		'source' => 'local',
		'token' => $record['token'],
		'trackingToken' => $record['token'],
		'mode' => $record['mode'],
		'pollerProvider' => !empty($record['pollerProvider']) ? $record['pollerProvider'] : null,
		'pollerStatus' => !empty($record['pollerStatus']) ? $record['pollerStatus'] : null,
		'status' => $record['status'],
		'trackingStatus' => $record['status'],
		'displayStatus' => $display_status,
		'message' => isset($record['message']) ? $record['message'] : null,
		'enquiryId' => !empty($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : null,
		'externalId' => !empty($record['bydaExternalId']) ? $record['bydaExternalId'] : null,
		'bydaStatus' => !empty($record['bydaStatus']) ? $record['bydaStatus'] : null,
		'readyUrl' => !empty($record['fileUrl']) ? $record['fileUrl'] : (!empty($record['shareUrl']) ? $record['shareUrl'] : null),
		'fileUrl' => !empty($record['fileUrl']) ? $record['fileUrl'] : null,
		'sourceFileUrl' => !empty($record['sourceFileUrl']) ? $record['sourceFileUrl'] : null,
		'storageKey' => !empty($record['storageKey']) ? $record['storageKey'] : null,
		'fileUrlExpiresAt' => !empty($record['fileUrlExpiresAt']) ? $record['fileUrlExpiresAt'] : null,
		'reportFinalized' => !empty($record['reportFinalized']),
		'reportFinalizedAt' => !empty($record['reportFinalizedAt']) ? $record['reportFinalizedAt'] : null,
		'shareUrl' => !empty($record['shareUrl']) ? $record['shareUrl'] : null,
		'site' => !empty($record['site']) ? $record['site'] : null,
		'error' => !empty($record['error']) ? $record['error'] : null,
		'userReference' => !empty($record['input']['userReference']) ? $record['input']['userReference'] : null,
		'digStartAt' => !empty($record['input']['digStartAt']) ? $record['input']['digStartAt'] : null,
		'digEndAt' => !empty($record['input']['digEndAt']) ? $record['input']['digEndAt'] : null,
		'addressLabel' => !empty($record['site']['label']) ? $record['site']['label'] : null,
		'siteSource' => !empty($record['site']['source']) ? $record['site']['source'] : null,
		'createdAt' => !empty($record['createdAt']) ? $record['createdAt'] : null,
		'updatedAt' => !empty($record['updatedAt']) ? $record['updatedAt'] : null,
		'lastPolledAt' => !empty($record['lastPolledAt']) ? $record['lastPolledAt'] : null,
	);
}

function byda_iet_to_remote_history_item($record) {
	return array(
		'source' => 'byda',
		'token' => null,
		'trackingToken' => null,
		'mode' => 'live',
		'status' => null,
		'trackingStatus' => null,
		'displayStatus' => !empty($record['bydaStatus']) ? $record['bydaStatus'] : 'unknown',
		'message' => 'Loaded from BYDA history search.',
		'enquiryId' => !empty($record['enquiryId']) ? $record['enquiryId'] : null,
		'externalId' => !empty($record['externalId']) ? $record['externalId'] : null,
		'bydaStatus' => !empty($record['bydaStatus']) ? $record['bydaStatus'] : null,
		'readyUrl' => null,
		'fileUrl' => null,
		'shareUrl' => null,
		'error' => null,
		'userReference' => !empty($record['userReference']) ? $record['userReference'] : null,
		'digStartAt' => !empty($record['digStartAt']) ? $record['digStartAt'] : null,
		'digEndAt' => !empty($record['digEndAt']) ? $record['digEndAt'] : null,
		'addressLabel' => !empty($record['addressLabel']) ? $record['addressLabel'] : null,
		'siteSource' => 'BYDA search',
		'createdAt' => !empty($record['createdAt']) ? $record['createdAt'] : null,
		'updatedAt' => !empty($record['updatedAt']) ? $record['updatedAt'] : null,
		'lastPolledAt' => null,
	);
}

function byda_iet_merge_history_item($local_record, $remote_record) {
	$display_status = byda_iet_resolve_display_status(
		isset($local_record['status']) ? $local_record['status'] : '',
		!empty($remote_record['bydaStatus']) ? $remote_record['bydaStatus'] : (!empty($local_record['bydaStatus']) ? $local_record['bydaStatus'] : null)
	);

	return array(
		'source' => 'both',
		'token' => $local_record['token'],
		'trackingToken' => $local_record['token'],
		'mode' => $local_record['mode'],
		'pollerProvider' => !empty($local_record['pollerProvider']) ? $local_record['pollerProvider'] : null,
		'pollerStatus' => !empty($local_record['pollerStatus']) ? $local_record['pollerStatus'] : null,
		'status' => $local_record['status'],
		'trackingStatus' => $local_record['status'],
		'displayStatus' => $display_status,
		'message' => isset($local_record['message']) ? $local_record['message'] : null,
		'enquiryId' => !empty($remote_record['enquiryId']) ? $remote_record['enquiryId'] : (!empty($local_record['bydaEnquiryId']) ? $local_record['bydaEnquiryId'] : null),
		'externalId' => !empty($remote_record['externalId']) ? $remote_record['externalId'] : (!empty($local_record['bydaExternalId']) ? $local_record['bydaExternalId'] : null),
		'bydaStatus' => !empty($remote_record['bydaStatus']) ? $remote_record['bydaStatus'] : (!empty($local_record['bydaStatus']) ? $local_record['bydaStatus'] : null),
		'readyUrl' => !empty($local_record['fileUrl']) ? $local_record['fileUrl'] : (!empty($local_record['shareUrl']) ? $local_record['shareUrl'] : null),
		'fileUrl' => !empty($local_record['fileUrl']) ? $local_record['fileUrl'] : null,
		'shareUrl' => !empty($local_record['shareUrl']) ? $local_record['shareUrl'] : null,
		'site' => !empty($local_record['site']) ? $local_record['site'] : null,
		'error' => !empty($local_record['error']) ? $local_record['error'] : null,
		'userReference' => !empty($remote_record['userReference']) ? $remote_record['userReference'] : (!empty($local_record['input']['userReference']) ? $local_record['input']['userReference'] : null),
		'digStartAt' => !empty($local_record['input']['digStartAt']) ? $local_record['input']['digStartAt'] : null,
		'digEndAt' => !empty($local_record['input']['digEndAt']) ? $local_record['input']['digEndAt'] : null,
		'addressLabel' => !empty($remote_record['addressLabel']) ? $remote_record['addressLabel'] : (!empty($local_record['site']['label']) ? $local_record['site']['label'] : null),
		'siteSource' => !empty($local_record['site']['source']) ? $local_record['site']['source'] : 'BYDA search',
		'createdAt' => !empty($remote_record['createdAt']) ? $remote_record['createdAt'] : (!empty($local_record['createdAt']) ? $local_record['createdAt'] : null),
		'updatedAt' => !empty($remote_record['updatedAt']) ? $remote_record['updatedAt'] : (!empty($local_record['updatedAt']) ? $local_record['updatedAt'] : null),
		'lastPolledAt' => !empty($local_record['lastPolledAt']) ? $local_record['lastPolledAt'] : null,
	);
}

function byda_iet_compare_iso_dates($left, $right) {
	return byda_iet_to_timestamp($left) - byda_iet_to_timestamp($right);
}

function byda_iet_find_matching_local_record($local_records, $local_records_by_enquiry_id, $matched_tokens, $remote_record) {
	if (!empty($remote_record['enquiryId']) && isset($local_records_by_enquiry_id[(string) $remote_record['enquiryId']])) {
		$exact_match = $local_records_by_enquiry_id[(string) $remote_record['enquiryId']];
		if (empty($matched_tokens[$exact_match['token']])) {
			return $exact_match;
		}
	}

	if (empty($remote_record['userReference'])) {
		return null;
	}

	$fallback_candidates = array_values(
		array_filter(
			$local_records,
			static function ($record) use ($matched_tokens, $remote_record) {
				return
					empty($matched_tokens[$record['token']]) &&
					!empty($record['input']['userReference']) &&
					$record['input']['userReference'] === $remote_record['userReference'];
			}
		)
	);

	usort(
		$fallback_candidates,
		static function ($left, $right) use ($remote_record) {
			$remote_time = byda_iet_to_timestamp(isset($remote_record['createdAt']) ? $remote_record['createdAt'] : null);
			$left_delta = abs(byda_iet_to_timestamp(isset($left['createdAt']) ? $left['createdAt'] : null) - $remote_time);
			$right_delta = abs(byda_iet_to_timestamp(isset($right['createdAt']) ? $right['createdAt'] : null) - $remote_time);
			return $left_delta - $right_delta;
		}
	);

	return isset($fallback_candidates[0]) ? $fallback_candidates[0] : null;
}

function byda_iet_link_remote_identifiers($local_record, $remote_record) {
	if (!$local_record) {
		return null;
	}

	$needs_backfill =
		(!empty($remote_record['enquiryId']) && empty($local_record['bydaEnquiryId'])) ||
		(!empty($remote_record['externalId']) && empty($local_record['bydaExternalId'])) ||
		(!empty($remote_record['bydaStatus']) && $remote_record['bydaStatus'] !== (isset($local_record['bydaStatus']) ? $local_record['bydaStatus'] : null));

	if (!$needs_backfill) {
		return $local_record;
	}

	$updated = byda_iet_update_enquiry_record(
		$local_record['token'],
		static function ($current) use ($remote_record) {
			$current['bydaEnquiryId'] = !empty($current['bydaEnquiryId']) ? $current['bydaEnquiryId'] : (!empty($remote_record['enquiryId']) ? $remote_record['enquiryId'] : null);
			$current['bydaExternalId'] = !empty($current['bydaExternalId']) ? $current['bydaExternalId'] : (!empty($remote_record['externalId']) ? $remote_record['externalId'] : null);
			$current['bydaStatus'] = !empty($remote_record['bydaStatus']) ? $remote_record['bydaStatus'] : (!empty($current['bydaStatus']) ? $current['bydaStatus'] : null);
			return $current;
		}
	);

	return $updated ? $updated : $local_record;
}

function byda_iet_find_local_record_for_remote($remote_record) {
	$enquiry_id = !empty($remote_record['enquiryId']) ? $remote_record['enquiryId'] : null;
	$exact_match = $enquiry_id ? byda_iet_find_enquiry_by_byda_id($enquiry_id) : null;

	if ($exact_match) {
		return byda_iet_link_remote_identifiers($exact_match, $remote_record);
	}

	if (empty($remote_record['userReference'])) {
		return null;
	}

	$local_records = byda_iet_list_local_enquiry_records();
	$fallback_match = byda_iet_find_matching_local_record($local_records, array(), array(), $remote_record);

	return $fallback_match ? byda_iet_link_remote_identifiers($fallback_match, $remote_record) : null;
}

function byda_iet_build_ready_url($record) {
	if (!$record) {
		return null;
	}

	$has_report_link = !empty($record['readyUrl']) || !empty($record['fileUrl']) || !empty($record['shareUrl']);
	$remote_enquiry_id = !empty($record['enquiryId']) ? $record['enquiryId'] : (!empty($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : null);
	if (!$has_report_link && !$remote_enquiry_id) {
		return null;
	}

	$tracking_token = !empty($record['trackingToken']) ? $record['trackingToken'] : (!empty($record['token']) ? $record['token'] : null);
	if ($tracking_token) {
		return rest_url('byda-iet/v1/enquiries/' . rawurlencode((string) $tracking_token) . '/report');
	}

	if ($remote_enquiry_id) {
		return rest_url('byda-iet/v1/enquiries/byda/' . rawurlencode((string) $remote_enquiry_id) . '/report');
	}

	return null;
}

function byda_iet_to_history_payload($record) {
	if (!$record) {
		return null;
	}

	$record['readyUrl'] = byda_iet_build_ready_url($record);
	return $record;
}

function byda_iet_to_status_payload($record) {
	$display_status = byda_iet_resolve_display_status(
		isset($record['status']) ? $record['status'] : '',
		!empty($record['bydaStatus']) ? $record['bydaStatus'] : null
	);

	return array(
		'source' => 'local',
		'token' => $record['token'],
		'trackingToken' => $record['token'],
		'mode' => $record['mode'],
		'pollerProvider' => !empty($record['pollerProvider']) ? $record['pollerProvider'] : null,
		'pollerStatus' => !empty($record['pollerStatus']) ? $record['pollerStatus'] : null,
		'status' => $record['status'],
		'trackingStatus' => $record['status'],
		'displayStatus' => $display_status,
		'message' => isset($record['message']) ? $record['message'] : null,
		'enquiryId' => !empty($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : null,
		'externalId' => !empty($record['bydaExternalId']) ? $record['bydaExternalId'] : null,
		'bydaStatus' => !empty($record['bydaStatus']) ? $record['bydaStatus'] : null,
		'readyUrl' => byda_iet_build_ready_url(
			array(
				'token' => $record['token'],
				'trackingToken' => $record['token'],
				'enquiryId' => !empty($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : null,
				'fileUrl' => !empty($record['fileUrl']) ? $record['fileUrl'] : null,
				'shareUrl' => !empty($record['shareUrl']) ? $record['shareUrl'] : null,
			)
		),
		'fileUrl' => !empty($record['fileUrl']) ? $record['fileUrl'] : null,
		'sourceFileUrl' => !empty($record['sourceFileUrl']) ? $record['sourceFileUrl'] : null,
		'storageKey' => !empty($record['storageKey']) ? $record['storageKey'] : null,
		'fileUrlExpiresAt' => !empty($record['fileUrlExpiresAt']) ? $record['fileUrlExpiresAt'] : null,
		'reportFinalized' => !empty($record['reportFinalized']),
		'reportFinalizedAt' => !empty($record['reportFinalizedAt']) ? $record['reportFinalizedAt'] : null,
		'shareUrl' => !empty($record['shareUrl']) ? $record['shareUrl'] : null,
		'error' => !empty($record['error']) ? $record['error'] : null,
		'site' => !empty($record['site']) ? $record['site'] : null,
		'addressLabel' => !empty($record['site']['label']) ? $record['site']['label'] : null,
		'userReference' => !empty($record['input']['userReference']) ? $record['input']['userReference'] : null,
		'createdAt' => !empty($record['createdAt']) ? $record['createdAt'] : null,
		'updatedAt' => !empty($record['updatedAt']) ? $record['updatedAt'] : null,
		'lastPolledAt' => !empty($record['lastPolledAt']) ? $record['lastPolledAt'] : null,
	);
}

function byda_iet_build_remote_status_message($file_url, $share_url, $byda_status = null) {
	if ($file_url && byda_iet_is_all_received_status($byda_status)) {
		return 'Combined BYDA report is ready.';
	}

	if ($file_url) {
		return 'Partial BYDA report is available while responses are still arriving.';
	}

	if (byda_iet_is_all_received_status($byda_status)) {
		return 'All responses have been received. Waiting for the combined BYDA report download link.';
	}

	if ($share_url) {
		return 'BYDA historical enquiry loaded. Share link available while the combined report is checked.';
	}

	return 'BYDA historical enquiry loaded.';
}

function byda_iet_matches_local_record_address($record, $address) {
	$target = byda_iet_normalize_structured_address($address);
	$candidates = array();

	if (!empty($record['input']['address']) && is_array($record['input']['address'])) {
		$candidates[] = $record['input']['address'];
	}
	if (!empty($record['site']['address']) && is_array($record['site']['address'])) {
		$candidates[] = $record['site']['address'];
	}

	foreach ($candidates as $candidate) {
		if (byda_iet_addresses_match(byda_iet_normalize_structured_address($candidate), $target)) {
			return true;
		}
	}

	return false;
}

function byda_iet_matches_remote_record_address($record, $address) {
	return byda_iet_addresses_match(
		byda_iet_normalize_byda_address(isset($record['address']) ? $record['address'] : array()),
		byda_iet_normalize_structured_address($address)
	);
}

function byda_iet_render_mock_report_html($record) {
	$title = esc_html(isset($record['site']['label']) ? $record['site']['label'] : 'Unknown site');
	$token = esc_html(isset($record['token']) ? $record['token'] : '');
	$status = esc_html(isset($record['status']) ? $record['status'] : '');
	$created_at = esc_html(isset($record['createdAt']) ? $record['createdAt'] : '');
	$payload = esc_html(wp_json_encode(isset($record['input']) ? $record['input'] : array(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

	return '<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Mock BYDA Report</title>
	<style>
		body{font-family:system-ui,sans-serif;margin:0;padding:2rem;background:#f5f0e8;color:#1a1f1d}
		main{max-width:760px;margin:0 auto;background:#fff;padding:2rem;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.08)}
		h1{margin-top:0}
		dl{display:grid;grid-template-columns:180px 1fr;gap:.75rem 1rem}
		dt{font-weight:700}
		dd{margin:0}
		pre{overflow:auto;background:#f3efe7;padding:1rem;border-radius:12px}
	</style>
</head>
<body>
	<main>
		<h1>Mock BYDA Report</h1>
		<p>This is a placeholder report generated by the WordPress mock workflow.</p>
		<dl>
			<dt>Tracking token</dt>
			<dd>' . $token . '</dd>
			<dt>Address</dt>
			<dd>' . $title . '</dd>
			<dt>Status</dt>
			<dd>' . $status . '</dd>
			<dt>Created</dt>
			<dd>' . $created_at . '</dd>
		</dl>
		<h2>Submitted payload</h2>
		<pre>' . $payload . '</pre>
	</main>
</body>
</html>';
}
