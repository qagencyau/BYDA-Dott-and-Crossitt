<?php

defined('ABSPATH') || exit;

function byda_iet_external_poller_secret_header_name() {
	return 'X-BYDA-IET-Secret';
}

function byda_iet_get_external_poller_config($settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	$base_url = !empty($settings['external_poller_base_url']) ? untrailingslashit((string) $settings['external_poller_base_url']) : '';
	$shared_secret = isset($settings['external_poller_shared_secret']) ? trim((string) $settings['external_poller_shared_secret']) : '';

	return array(
		'baseUrl' => esc_url_raw($base_url),
		'sharedSecret' => $shared_secret,
		'headerName' => byda_iet_external_poller_secret_header_name(),
		'callbackUrl' => rest_url('byda-iet/v1/poller-callback'),
		'configured' => '' !== $base_url && '' !== $shared_secret,
	);
}

function byda_iet_external_poller_is_enabled($settings = null) {
	$config = byda_iet_get_external_poller_config($settings);
	return !empty($config['configured']);
}

function byda_iet_external_poller_proxy_is_enabled($settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	return empty($settings['byda_use_mock']) && byda_iet_external_poller_is_enabled($settings);
}

function byda_iet_external_poller_request($method, $pathname, $body = null, $settings = null, $timeout_seconds = 20) {
	$config = byda_iet_get_external_poller_config($settings);
	if (empty($config['configured'])) {
		byda_iet_log(
			'External poller request skipped because configuration is incomplete.',
			array(
				'method' => $method,
				'pathname' => $pathname,
				'hasBaseUrl' => !empty($config['baseUrl']),
				'hasSharedSecret' => !empty($config['sharedSecret']),
			),
			'warning'
		);
		return new WP_Error('byda_iet_poller_not_configured', 'External BYDA poller is not fully configured.');
	}

	$pathname = '/' . ltrim((string) $pathname, '/');
	$args = array(
		'timeout' => max(1, (int) $timeout_seconds),
		'headers' => array(
			'Content-Type' => 'application/json',
			$config['headerName'] => $config['sharedSecret'],
		),
	);

	if (null !== $body) {
		$args['body'] = wp_json_encode($body);
	}

	byda_iet_log(
		'External poller request prepared.',
		array(
			'method' => strtoupper((string) $method),
			'pathname' => $pathname,
			'baseUrl' => byda_iet_debug_url_summary($config['baseUrl']),
			'timeoutSeconds' => $timeout_seconds,
			'hasBody' => null !== $body,
			'bodyKeys' => is_array($body) ? array_keys($body) : null,
			'token' => is_array($body) && isset($body['token']) ? $body['token'] : null,
			'callbackUrl' => is_array($body) && isset($body['callbackUrl']) ? byda_iet_debug_url_summary($body['callbackUrl']) : null,
		),
		'debug'
	);

	$response = byda_iet_remote_json_request($method, $config['baseUrl'] . $pathname, $args);

	if (is_wp_error($response)) {
		byda_iet_log_wp_error(
			'External poller request returned an error.',
			$response,
			array(
				'method' => strtoupper((string) $method),
				'pathname' => $pathname,
			)
		);
		return $response;
	}

	byda_iet_log(
		'External poller request completed.',
		array(
			'method' => strtoupper((string) $method),
			'pathname' => $pathname,
			'responseType' => gettype($response),
			'responseKeys' => is_array($response) ? array_keys($response) : null,
			'token' => is_array($response) && isset($response['token']) ? $response['token'] : null,
			'enquiryId' => is_array($response) && isset($response['enquiryId']) ? $response['enquiryId'] : null,
			'status' => is_array($response) && isset($response['status']) ? $response['status'] : null,
			'bydaStatus' => is_array($response) && isset($response['bydaStatus']) ? $response['bydaStatus'] : null,
			'pollerStatus' => is_array($response) && isset($response['pollerStatus']) ? $response['pollerStatus'] : null,
			'hasFileUrl' => is_array($response) && !empty($response['fileUrl']),
			'hasShareUrl' => is_array($response) && !empty($response['shareUrl']),
		),
		'debug'
	);

	return $response;
}

function byda_iet_external_poller_get_options($settings = null) {
	return byda_iet_external_poller_request('GET', '/options', null, $settings);
}

function byda_iet_external_poller_get_organisations($site, $settings = null) {
	return byda_iet_external_poller_request(
		'POST',
		'/organisations/search',
		array(
			'resolvedSite' => $site,
			'polygon' => isset($site['polygon']) ? $site['polygon'] : null,
		),
		$settings
	);
}

function byda_iet_external_poller_create_enquiry($record, $byda_payload, $settings = null) {
	if (!is_array($record) || empty($record['token'])) {
		return new WP_Error('byda_iet_poller_invalid_record', 'Enquiry record is missing the token.');
	}
	if (!is_array($byda_payload) || empty($byda_payload)) {
		return new WP_Error('byda_iet_poller_invalid_payload', 'BYDA enquiry payload is required.');
	}

	return byda_iet_external_poller_request(
		'POST',
		'/enquiries',
		array(
			'token' => $record['token'],
			'callbackUrl' => rest_url('byda-iet/v1/poller-callback'),
			'payload' => $byda_payload,
		),
		$settings,
		30
	);
}

function byda_iet_external_poller_search_enquiries($args = array(), $settings = null) {
	$query = array(
		'limit' => isset($args['limit']) ? max(1, min(100, (int) $args['limit'])) : 20,
		'offset' => isset($args['offset']) ? max(0, (int) $args['offset']) : 0,
	);

	if (!empty($args['createdAfter'])) {
		$query['createdAfter'] = $args['createdAfter'];
	}

	$pathname = byda_iet_build_url('/enquiries/search', $query);
	return byda_iet_external_poller_request('GET', $pathname, null, $settings);
}

function byda_iet_external_poller_get_enquiry_status($enquiry_id, $settings = null) {
	$enquiry_id = trim((string) $enquiry_id);
	if ('' === $enquiry_id) {
		return new WP_Error('byda_iet_poller_invalid_enquiry_id', 'BYDA enquiry ID is required.');
	}

	return byda_iet_external_poller_request(
		'GET',
		'/enquiries/' . rawurlencode($enquiry_id),
		null,
		$settings,
		30
	);
}

function byda_iet_external_poller_get_enquiry_report($enquiry_id, $settings = null, $existing = array()) {
	$enquiry_id = trim((string) $enquiry_id);
	if ('' === $enquiry_id) {
		return new WP_Error('byda_iet_poller_invalid_enquiry_id', 'BYDA enquiry ID is required.');
	}

	$query = array();
	if (is_array($existing)) {
		foreach (array('bydaStatus', 'sourceFileUrl', 'storageKey', 'fileUrlExpiresAt', 'reportFinalizedAt', 'combinedFileId', 'combinedJobId') as $key) {
			if (!empty($existing[$key])) {
				$query[$key] = $existing[$key];
			}
		}
		if (!empty($existing['reportFinalized'])) {
			$query['reportFinalized'] = true;
		}
	}

	$pathname = byda_iet_build_url('/enquiries/' . rawurlencode($enquiry_id) . '/report', $query);

	return byda_iet_external_poller_request(
		'GET',
		$pathname,
		null,
		$settings,
		30
	);
}

function byda_iet_record_uses_external_poller($record, $settings = null) {
	if (!is_array($record) || empty($record) || 'live' !== (isset($record['mode']) ? $record['mode'] : 'live')) {
		return false;
	}

	if ('external' !== strtolower(trim((string) (isset($record['pollerProvider']) ? $record['pollerProvider'] : '')))) {
		return false;
	}

	return true;
}

function byda_iet_verify_external_poller_secret($secret, $settings = null) {
	$config = byda_iet_get_external_poller_config($settings);
	$expected = isset($config['sharedSecret']) ? (string) $config['sharedSecret'] : '';
	$candidate = trim((string) $secret);

	if ('' === $candidate || '' === $expected) {
		return false;
	}

	if (strlen($candidate) !== strlen($expected)) {
		return false;
	}

	return hash_equals($expected, $candidate);
}

function byda_iet_rest_poller_callback_permission(WP_REST_Request $request) {
	$config = byda_iet_get_external_poller_config();
	if (empty($config['configured'])) {
		byda_iet_log(
			'Poller callback rejected because callbacks are not configured.',
			array(
				'hasBaseUrl' => !empty($config['baseUrl']),
				'hasSharedSecret' => !empty($config['sharedSecret']),
				'route' => $request->get_route(),
			),
			'warning'
		);
		return new WP_Error(
			'byda_iet_poller_disabled',
			'External BYDA poller callbacks are not configured.',
			array('status' => 403)
		);
	}

	$secret = $request->get_header($config['headerName']);
	if (!byda_iet_verify_external_poller_secret($secret)) {
		byda_iet_log(
			'Poller callback rejected by shared-secret check.',
			array(
				'route' => $request->get_route(),
				'hasProvidedSecret' => '' !== trim((string) $secret),
				'providedSecretLength' => strlen(trim((string) $secret)),
				'expectedSecretLength' => strlen((string) $config['sharedSecret']),
			),
			'warning'
		);
		return new WP_Error(
			'byda_iet_poller_unauthorized',
			'Unauthorized poller callback.',
			array('status' => 401)
		);
	}

	byda_iet_log(
		'Poller callback permission accepted.',
		array(
			'route' => $request->get_route(),
			'secretLength' => strlen(trim((string) $secret)),
		),
		'debug'
	);

	return true;
}

function byda_iet_normalize_external_poller_status($value) {
	$status = strtolower(trim((string) $value));
	if (in_array($status, array('started', 'polling', 'completed', 'failed', 'expired', 'cancelled'), true)) {
		return $status;
	}

	return '' === $status ? 'polling' : $status;
}

function byda_iet_handle_external_poller_callback($payload, $settings = null) {
	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	$payload = is_array($payload) ? $payload : array();

	byda_iet_log(
		'External poller callback received.',
		byda_iet_debug_poller_payload_summary($payload),
		'debug'
	);

	$token = trim((string) (isset($payload['token']) ? $payload['token'] : ''));
	if ('' === $token) {
		byda_iet_log('External poller callback missing token.', byda_iet_debug_poller_payload_summary($payload), 'warning');
		return new WP_Error('byda_iet_bad_request', 'token is required.', array('status' => 400));
	}

	$record = byda_iet_get_enquiry_record($token);
	if (!$record) {
		byda_iet_log(
			'External poller callback token did not match a local record.',
			array(
				'token' => $token,
				'payload' => byda_iet_debug_poller_payload_summary($payload),
			),
			'warning'
		);
		return new WP_Error('byda_iet_not_found', 'Tracking token not found.', array('status' => 404));
	}

	byda_iet_log(
		'External poller callback matched local record.',
		array(
			'payload' => byda_iet_debug_poller_payload_summary($payload),
			'before' => byda_iet_debug_record_summary($record),
		),
		'debug'
	);

	$incoming_enquiry_id = trim((string) (isset($payload['enquiryId']) ? $payload['enquiryId'] : ''));
	$current_enquiry_id = trim((string) (isset($record['bydaEnquiryId']) ? $record['bydaEnquiryId'] : ''));
	if ('' !== $incoming_enquiry_id && '' !== $current_enquiry_id && $incoming_enquiry_id !== $current_enquiry_id) {
		byda_iet_log(
			'External poller callback enquiry ID conflict.',
			array(
				'token' => $token,
				'incomingEnquiryId' => $incoming_enquiry_id,
				'currentEnquiryId' => $current_enquiry_id,
				'payload' => byda_iet_debug_poller_payload_summary($payload),
			),
			'warning'
		);
		return new WP_Error(
			'byda_iet_conflict',
			'Callback enquiry ID does not match the stored enquiry.',
			array('status' => 409)
		);
	}

	$share_url = !empty($payload['shareUrl']) ? esc_url_raw((string) $payload['shareUrl']) : '';
	$file_url = !empty($payload['fileUrl']) ? esc_url_raw((string) $payload['fileUrl']) : '';
	$source_file_url = !empty($payload['sourceFileUrl']) ? esc_url_raw((string) $payload['sourceFileUrl']) : '';
	$storage_key = isset($payload['storageKey']) ? trim((string) $payload['storageKey']) : '';
	$file_url_expires_at = isset($payload['fileUrlExpiresAt']) ? trim((string) $payload['fileUrlExpiresAt']) : '';
	$report_finalized = !empty($payload['reportFinalized']);
	$report_finalized_at = isset($payload['reportFinalizedAt']) ? trim((string) $payload['reportFinalizedAt']) : '';
	$combined_file_id = isset($payload['combinedFileId']) ? trim((string) $payload['combinedFileId']) : '';
	$combined_job_id = isset($payload['combinedJobId']) ? trim((string) $payload['combinedJobId']) : '';
	$byda_status = isset($payload['bydaStatus']) ? trim((string) $payload['bydaStatus']) : '';
	$poller_status = byda_iet_normalize_external_poller_status(
		isset($payload['pollerStatus']) ? $payload['pollerStatus'] : ($file_url ? 'completed' : 'polling')
	);
	$error = isset($payload['error']) ? trim((string) $payload['error']) : '';

	byda_iet_log(
		'External poller callback normalized.',
		array(
			'token' => $token,
			'incomingEnquiryId' => $incoming_enquiry_id,
			'currentEnquiryId' => $current_enquiry_id,
			'bydaStatus' => $byda_status,
			'pollerStatus' => $poller_status,
			'hasShareUrl' => '' !== $share_url,
			'hasFileUrl' => '' !== $file_url,
			'hasSourceFileUrl' => '' !== $source_file_url,
			'combinedFileId' => $combined_file_id,
			'combinedJobId' => $combined_job_id,
			'storageKey' => $storage_key,
			'fileUrlExpiresAt' => $file_url_expires_at,
			'reportFinalized' => $report_finalized,
			'reportFinalizedAt' => $report_finalized_at,
			'error' => $error,
		),
		'debug'
	);

	$updated_record = byda_iet_update_enquiry_record(
		$token,
		static function ($current) use ($incoming_enquiry_id, $share_url, $file_url, $source_file_url, $storage_key, $file_url_expires_at, $report_finalized, $report_finalized_at, $combined_file_id, $combined_job_id, $byda_status, $poller_status, $error) {
			$now = byda_iet_now_iso8601();
			$resolved_share_url = '' !== $share_url ? $share_url : (isset($current['shareUrl']) ? $current['shareUrl'] : null);
			$resolved_file_url = '' !== $file_url ? $file_url : (isset($current['fileUrl']) ? $current['fileUrl'] : null);
			$resolved_byda_status = '' !== $byda_status ? $byda_status : (isset($current['bydaStatus']) ? $current['bydaStatus'] : null);

			$current['pollerProvider'] = 'external';
			$current['pollerStatus'] = $poller_status;
			$current['pollerLastCallbackAt'] = $now;
			$current['pollerStartedAt'] = !empty($current['pollerStartedAt']) ? $current['pollerStartedAt'] : $now;
			$current['pollerLastError'] = '' !== $error ? substr($error, 0, 500) : null;
			$current['lastPolledAt'] = $now;
			$current['updatedAt'] = $now;

			if ('' !== $incoming_enquiry_id) {
				$current['bydaEnquiryId'] = $incoming_enquiry_id;
			}
			if ($resolved_byda_status) {
				$current['bydaStatus'] = $resolved_byda_status;
			}
			if ($resolved_share_url) {
				$current['shareUrl'] = $resolved_share_url;
			}
			if ($resolved_file_url) {
				$current['fileUrl'] = $resolved_file_url;
			}
			if ('' !== $source_file_url) {
				$current['sourceFileUrl'] = $source_file_url;
			}
			if ('' !== $storage_key) {
				$current['storageKey'] = $storage_key;
			}
			if ('' !== $file_url_expires_at) {
				$current['fileUrlExpiresAt'] = $file_url_expires_at;
			}
			if ($report_finalized) {
				$current['reportFinalized'] = true;
				$current['reportFinalizedAt'] = '' !== $report_finalized_at ? $report_finalized_at : $now;
			}
			if ('' !== $combined_file_id) {
				$current['combinedFileId'] = $combined_file_id;
			}
			if ('' !== $combined_job_id) {
				$current['combinedJobId'] = $combined_job_id;
			}

			if ($resolved_file_url && !empty($current['reportFinalized'])) {
				$current['status'] = 'ready';
				$current['message'] = byda_iet_build_live_report_message($resolved_file_url, $resolved_share_url, $resolved_byda_status);
				$current['error'] = null;
				return $current;
			}

			if (in_array($poller_status, array('failed', 'expired', 'cancelled'), true)) {
				$current['status'] = 'failed';
				$current['message'] = '' !== $error
					? substr($error, 0, 200)
					: 'External BYDA poller stopped before the combined report became available.';
				$current['error'] = '' !== $error ? substr($error, 0, 500) : 'External BYDA poller failed.';
				return $current;
			}

			if (empty($current['reportFinalized']) || 'ready' !== (isset($current['status']) ? $current['status'] : '')) {
				$current['status'] = 'processing';
			}
			$current['message'] = byda_iet_build_live_report_message($resolved_file_url, $resolved_share_url, $resolved_byda_status);
			$current['error'] = null;

			return $current;
		}
	);

	if (!$updated_record) {
		byda_iet_log(
			'External poller callback failed because update returned no record.',
			array(
				'token' => $token,
				'payload' => byda_iet_debug_poller_payload_summary($payload),
			),
			'warning'
		);
		return new WP_Error('byda_iet_not_found', 'Tracking token not found.', array('status' => 404));
	}

	byda_iet_log(
		'External poller callback stored local record update.',
		array(
			'payload' => byda_iet_debug_poller_payload_summary($payload),
			'after' => byda_iet_debug_record_summary($updated_record),
		),
		'debug'
	);

	if (function_exists('byda_iet_sync_report_url_to_entry')) {
		$synced = byda_iet_sync_report_url_to_entry($updated_record, $settings);
		byda_iet_log(
			'External poller callback Gravity Forms report URL sync attempted.',
			array(
				'token' => $token,
				'synced' => (bool) $synced,
				'entryId' => isset($updated_record['entryId']) ? $updated_record['entryId'] : null,
				'gfReportUrlFieldId' => isset($updated_record['gfReportUrlFieldId']) ? $updated_record['gfReportUrlFieldId'] : null,
			),
			'debug'
		);
	}

	byda_iet_unschedule_refresh_event($token);
	byda_iet_log(
		'External poller callback completed.',
		array(
			'token' => $token,
			'status' => isset($updated_record['status']) ? $updated_record['status'] : null,
			'pollerStatus' => isset($updated_record['pollerStatus']) ? $updated_record['pollerStatus'] : null,
			'hasFileUrl' => !empty($updated_record['fileUrl']),
			'hasShareUrl' => !empty($updated_record['shareUrl']),
		),
		'debug'
	);

	return $updated_record;
}
