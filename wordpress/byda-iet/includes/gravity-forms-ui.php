<?php

defined('ABSPATH') || exit;

function byda_iet_register_gf_ui_hooks() {
	add_filter('gform_pre_render', 'byda_iet_inject_component_into_form');
	add_filter('gform_pre_validation', 'byda_iet_inject_component_into_form');
	add_filter('gform_pre_submission_filter', 'byda_iet_inject_component_into_form');
	add_action('gform_enqueue_scripts', 'byda_iet_maybe_enqueue_frontend_assets', 10, 2);
}

function byda_iet_get_gf_entry_value($entry, $field_id) {
	$field_id = trim((string) $field_id);
	if ('' === $field_id) {
		return '';
	}

	if (function_exists('rgar')) {
		$value = rgar($entry, $field_id);
	} else {
		$value = isset($entry[$field_id]) ? $entry[$field_id] : '';
	}

	return is_string($value) ? trim($value) : $value;
}

function byda_iet_build_tracking_report_url($token) {
	$token = trim((string) $token);
	if ('' === $token) {
		return '';
	}

	return rest_url('byda-iet/v1/enquiries/' . rawurlencode($token) . '/report');
}

function byda_iet_sync_report_url_to_entry($record, $settings = null) {
	if (
		!is_array($record) ||
		empty($record['token']) ||
		empty($record['entryId']) ||
		!class_exists('GFAPI')
	) {
		byda_iet_log(
			'Gravity Forms report URL sync skipped before field lookup.',
			array(
				'record' => byda_iet_debug_record_summary(is_array($record) ? $record : array()),
				'hasGFAPI' => class_exists('GFAPI'),
			),
			'debug'
		);
		return false;
	}

	$settings = is_array($settings) ? $settings : byda_iet_get_settings();
	$field_id = !empty($record['gfReportUrlFieldId'])
		? trim((string) $record['gfReportUrlFieldId'])
		: (isset($settings['gf_report_url_field_id']) ? trim((string) $settings['gf_report_url_field_id']) : '');
	if ('' === $field_id) {
		byda_iet_log(
			'Gravity Forms report URL sync skipped because report URL field is not configured.',
			array(
				'record' => byda_iet_debug_record_summary($record),
			),
			'warning'
		);
		return false;
	}

	$report_url = !empty($record['reportUrl']) ? esc_url_raw($record['reportUrl']) : byda_iet_build_tracking_report_url($record['token']);
	if ('' === $report_url) {
		byda_iet_log(
			'Gravity Forms report URL sync skipped because report URL could not be built.',
			array(
				'record' => byda_iet_debug_record_summary($record),
			),
			'warning'
		);
		return false;
	}

	$result = GFAPI::update_entry_field((int) $record['entryId'], $field_id, $report_url);
	byda_iet_log(
		'Gravity Forms report URL sync attempted.',
		array(
			'token' => $record['token'],
			'entryId' => (int) $record['entryId'],
			'fieldId' => $field_id,
			'reportUrl' => byda_iet_debug_url_summary($report_url),
			'result' => is_wp_error($result) ? byda_iet_error_message($result) : $result,
			'success' => !is_wp_error($result) && false !== $result,
		),
		is_wp_error($result) || false === $result ? 'warning' : 'debug'
	);
	return !is_wp_error($result) && false !== $result;
}

function byda_iet_sync_entry_report_url_after_save($entry, $form) {
	$settings = byda_iet_get_settings();
	$target_form_id = isset($settings['gf_form_id']) ? absint($settings['gf_form_id']) : 0;
	$form_id = is_array($form) && isset($form['id']) ? absint($form['id']) : 0;
	if ($target_form_id && $form_id && $form_id !== $target_form_id) {
		byda_iet_log(
			'Gravity Forms after-save sync skipped because form ID does not match.',
			array(
				'entryId' => isset($entry['id']) ? $entry['id'] : null,
				'formId' => $form_id,
				'targetFormId' => $target_form_id,
			),
			'debug'
		);
		return $entry;
	}

	$tracking_field_id = isset($settings['gf_tracking_token_field_id']) ? trim((string) $settings['gf_tracking_token_field_id']) : '';
	$report_url_field_id = isset($settings['gf_report_url_field_id']) ? trim((string) $settings['gf_report_url_field_id']) : '';
	if ('' === $tracking_field_id || '' === $report_url_field_id || !class_exists('GFAPI')) {
		byda_iet_log(
			'Gravity Forms after-save sync skipped because fields or GFAPI are unavailable.',
			array(
				'entryId' => isset($entry['id']) ? $entry['id'] : null,
				'formId' => $form_id,
				'trackingFieldId' => $tracking_field_id,
				'reportUrlFieldId' => $report_url_field_id,
				'hasGFAPI' => class_exists('GFAPI'),
			),
			'debug'
		);
		return $entry;
	}

	$token = trim((string) byda_iet_get_gf_entry_value($entry, $tracking_field_id));
	if ('' === $token) {
		byda_iet_log(
			'Gravity Forms after-save sync skipped because tracking token field is empty.',
			array(
				'entryId' => isset($entry['id']) ? $entry['id'] : null,
				'formId' => $form_id,
				'trackingFieldId' => $tracking_field_id,
			),
			'debug'
		);
		return $entry;
	}

	$entry_id = isset($entry['id']) ? absint($entry['id']) : 0;
	if (!$entry_id) {
		byda_iet_log(
			'Gravity Forms after-save sync skipped because entry ID is missing.',
			array(
				'token' => $token,
				'formId' => $form_id,
			),
			'warning'
		);
		return $entry;
	}

	$report_url = byda_iet_build_tracking_report_url($token);
	$result = GFAPI::update_entry_field($entry_id, $report_url_field_id, $report_url);
	byda_iet_log(
		'Gravity Forms after-save report URL field update attempted.',
		array(
			'token' => $token,
			'entryId' => $entry_id,
			'formId' => $form_id,
			'fieldId' => $report_url_field_id,
			'reportUrl' => byda_iet_debug_url_summary($report_url),
			'result' => is_wp_error($result) ? byda_iet_error_message($result) : $result,
			'success' => !is_wp_error($result) && false !== $result,
		),
		is_wp_error($result) || false === $result ? 'warning' : 'debug'
	);

	$record = byda_iet_get_enquiry_record($token);
	if ($record) {
		byda_iet_update_enquiry_record(
			$token,
			array(
				'entryId' => $entry_id,
				'gfFormId' => $form_id ? $form_id : $target_form_id,
				'gfReportUrlFieldId' => $report_url_field_id,
				'reportUrl' => $report_url,
				'updatedAt' => byda_iet_now_iso8601(),
			)
		);
		byda_iet_log(
			'Gravity Forms after-save linked local record to entry.',
			array(
				'token' => $token,
				'entryId' => $entry_id,
				'formId' => $form_id ? $form_id : $target_form_id,
				'fieldId' => $report_url_field_id,
			),
			'debug'
		);
	} else {
		byda_iet_log(
			'Gravity Forms after-save found no local record for tracking token.',
			array(
				'token' => $token,
				'entryId' => $entry_id,
				'formId' => $form_id,
			),
			'warning'
		);
	}

	return $entry;
}

function byda_iet_maybe_enqueue_frontend_assets($form, $is_ajax) {
	if (is_admin() && function_exists('wp_doing_ajax') && !wp_doing_ajax()) {
		return;
	}

	$settings = byda_iet_get_settings();
	$target_form_id = isset($settings['gf_form_id']) ? absint($settings['gf_form_id']) : 0;
	if (!$target_form_id) {
		return;
	}

	$form_id = 0;
	if (is_array($form)) {
		$form_id = isset($form['id']) ? absint($form['id']) : 0;
	} elseif (is_object($form)) {
		$form_id = isset($form->id) ? absint($form->id) : 0;
	}

	if ($form_id && $form_id !== $target_form_id) {
		return;
	}

	byda_iet_enqueue_frontend_assets();
}

function byda_iet_inject_component_into_form($form) {
	if (is_admin() && function_exists('wp_doing_ajax') && !wp_doing_ajax()) {
		return $form;
	}

	if (!is_array($form) || empty($form['fields'])) {
		return $form;
	}

	$settings = byda_iet_get_settings();
	$target_form_id = isset($settings['gf_form_id']) ? absint($settings['gf_form_id']) : 0;
	if ($target_form_id && (int) $form['id'] !== $target_form_id) {
		return $form;
	}

	$component_ids = byda_iet_parse_component_field_ids(isset($settings['gf_component_field_id']) ? $settings['gf_component_field_id'] : '');

	foreach ($form['fields'] as &$field) {
		$field_id = is_object($field) ? $field->id : (isset($field['id']) ? $field['id'] : '');
		$field_type = is_object($field) ? $field->type : (isset($field['type']) ? $field['type'] : '');
		if ('html' !== $field_type) {
			continue;
		}

		$content = is_object($field) ? $field->content : (isset($field['content']) ? $field['content'] : '');
		$has_placeholder = byda_iet_contains_placeholder($content);
		$is_target = !empty($component_ids) && in_array((string) $field_id, $component_ids, true);

		if (!$has_placeholder && !$is_target) {
			continue;
		}

		$content = byda_iet_normalize_component_placeholder($content);
		if ('' === trim($content)) {
			$content = '[byda_iet]';
		}

		if (!byda_iet_contains_shortcode($content)) {
			continue;
		}

		$rendered = do_shortcode($content);
		if (is_object($field)) {
			$field->content = $rendered;
		} else {
			$field['content'] = $rendered;
		}
	}
	unset($field);

	return $form;
}

function byda_iet_parse_component_field_ids($raw_value) {
	if (!is_string($raw_value) || '' === $raw_value) {
		return array();
	}

	$parts = preg_split('/[,\s]+/', $raw_value, -1, PREG_SPLIT_NO_EMPTY);

	return $parts ? array_map('strval', $parts) : array();
}

function byda_iet_normalize_component_placeholder($content) {
	if (!is_string($content)) {
		return '';
	}

	if (false !== strpos($content, '{{byda_iet}}')) {
		$content = str_replace('{{byda_iet}}', '[byda_iet]', $content);
	}

	return $content;
}

function byda_iet_contains_placeholder($content) {
	if (!is_string($content) || '' === $content) {
		return false;
	}

	return false !== strpos($content, '{{byda_iet}}') || false !== strpos($content, '[byda_iet');
}

function byda_iet_contains_shortcode($content) {
	if (!is_string($content) || '' === $content) {
		return false;
	}

	return false !== strpos($content, '[byda_iet');
}
