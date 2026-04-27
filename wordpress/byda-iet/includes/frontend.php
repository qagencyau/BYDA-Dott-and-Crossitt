<?php

defined('ABSPATH') || exit;

function byda_iet_register_shortcodes() {
	add_shortcode('byda_iet', 'byda_iet_render_shortcode');
}

function byda_iet_enqueue_frontend_assets() {
	static $enqueued = false;

	if ($enqueued) {
		return;
	}

	$component_path = BYDA_IET_PATH . 'assets/js/byda-components.js';
	$frontend_path = BYDA_IET_PATH . 'assets/js/frontend.js';
	$component_version = file_exists($component_path) ? filemtime($component_path) : BYDA_IET_VERSION;
	$frontend_version = file_exists($frontend_path) ? filemtime($frontend_path) : BYDA_IET_VERSION;

	wp_enqueue_script(
		'byda-iet-components',
		BYDA_IET_URL . 'assets/js/byda-components.js',
		array(),
		$component_version,
		true
	);

	wp_enqueue_script(
		'byda-iet-frontend',
		BYDA_IET_URL . 'assets/js/frontend.js',
		array('byda-iet-components'),
		$frontend_version,
		true
	);

	wp_localize_script(
		'byda-iet-frontend',
		'bydaIetSettings',
		byda_iet_get_frontend_settings()
	);

	$enqueued = true;
}

function byda_iet_get_frontend_settings() {
	$settings = byda_iet_get_settings();

	return array(
		'apiBase' => rest_url('byda-iet/v1'),
		'gfFormId' => isset($settings['gf_form_id']) ? (int) $settings['gf_form_id'] : 0,
		'gfTrackingTokenFieldId' => isset($settings['gf_tracking_token_field_id']) ? $settings['gf_tracking_token_field_id'] : '',
		'gfReportUrlFieldId' => isset($settings['gf_report_url_field_id']) ? $settings['gf_report_url_field_id'] : '',
		'gfStreetNumberFieldId' => isset($settings['gf_street_number_field_id']) ? $settings['gf_street_number_field_id'] : '',
		'gfStreetNameFieldId' => isset($settings['gf_street_name_field_id']) ? $settings['gf_street_name_field_id'] : '',
		'gfSuburbFieldId' => isset($settings['gf_suburb_field_id']) ? $settings['gf_suburb_field_id'] : '',
		'gfStateFieldId' => isset($settings['gf_state_field_id']) ? $settings['gf_state_field_id'] : '',
		'gfPostcodeFieldId' => isset($settings['gf_postcode_field_id']) ? $settings['gf_postcode_field_id'] : '',
		'gfReferenceFieldId' => isset($settings['gf_reference_field_id']) ? $settings['gf_reference_field_id'] : '',
		'pollIntervalMs' => max(5000, (int) $settings['poll_interval_seconds'] * 1000),
	);
}

function byda_iet_shortcode_truthy($value) {
	return in_array(strtolower(trim((string) $value)), array('1', 'true', 'yes', 'on'), true);
}

function byda_iet_render_shortcode($atts) {
	static $instance_count = 0;

	byda_iet_enqueue_frontend_assets();
	$instance_count++;
	$settings = byda_iet_get_settings();
	$default_poll_interval_ms = max(5000, (int) $settings['poll_interval_seconds'] * 1000);
	$atts = shortcode_atts(
		array(
			'instance' => 'byda-iet-' . $instance_count,
			'heading' => 'Enquiry form',
			'debug' => '',
			'current_step' => '',
			'steps' => '',
			'details' => '',
			'next_label' => '',
			'previous_label' => '',
			'poll_interval_ms' => '',
			'address_source_selector' => '',
			'street_number_selector' => '',
			'street_name_selector' => '',
			'suburb_selector' => '',
			'state_selector' => '',
			'postcode_selector' => '',
			'reference_number' => '',
			'reference_number_selector' => '',
			'auto_search' => 'true',
		),
		$atts,
		'byda_iet'
	);

	$wrapper_attrs = array(
		'class' => 'byda-iet',
		'data-component-host' => 'byda-iet',
		'data-instance' => $atts['instance'],
		'data-auto-search' => byda_iet_shortcode_truthy($atts['auto_search']) ? 'true' : 'false',
	);

	foreach (array(
		'address_source_selector' => 'data-address-source-selector',
		'street_number_selector' => 'data-street-number-selector',
		'street_name_selector' => 'data-street-name-selector',
		'suburb_selector' => 'data-suburb-selector',
		'state_selector' => 'data-state-selector',
		'postcode_selector' => 'data-postcode-selector',
		'reference_number_selector' => 'data-reference-number-selector',
	) as $source_key => $attr_name) {
		if ('' !== $atts[$source_key]) {
			$wrapper_attrs[$attr_name] = $atts[$source_key];
		}
	}

	if ('' !== $atts['reference_number']) {
		$wrapper_attrs['data-reference-number'] = trim((string) $atts['reference_number']);
	}

	$component_attrs = array(
		'id' => $atts['instance'],
		'heading' => $atts['heading'],
		'options-endpoint' => rest_url('byda-iet/v1/options'),
		'address-search-endpoint' => rest_url('byda-iet/v1/addresses/search'),
		'address-history-endpoint' => rest_url('byda-iet/v1/enquiries/by-address'),
		'authorities-endpoint' => rest_url('byda-iet/v1/organisations/search'),
		'enquiry-create-endpoint' => rest_url('byda-iet/v1/enquiries'),
		'enquiry-status-endpoint' => rest_url('byda-iet/v1/enquiries'),
		'remote-enquiry-status-endpoint' => rest_url('byda-iet/v1/enquiries/byda'),
		'readonly-address' => '',
		'poll-interval-ms' => '' !== $atts['poll_interval_ms'] ? $atts['poll_interval_ms'] : $default_poll_interval_ms,
		'prefill-auto-search' => byda_iet_shortcode_truthy($atts['auto_search']) ? 'true' : 'false',
	);

	if ('' !== $atts['current_step']) {
		$component_attrs['current-step'] = $atts['current_step'];
	}
	if ('' !== $atts['steps']) {
		$component_attrs['steps'] = $atts['steps'];
	}
	if ('' !== $atts['details']) {
		$component_attrs['details'] = $atts['details'];
	}
	if ('' !== $atts['next_label']) {
		$component_attrs['next-label'] = $atts['next_label'];
	}
	if ('' !== $atts['previous_label']) {
		$component_attrs['previous-label'] = $atts['previous_label'];
	}
	if (byda_iet_shortcode_truthy($atts['debug'])) {
		$component_attrs['debug'] = '';
	}

	$wrapper_markup = '<div';
	foreach ($wrapper_attrs as $name => $value) {
		$wrapper_markup .= sprintf(' %1$s="%2$s"', esc_attr($name), esc_attr($value));
	}
	$wrapper_markup .= '>';

	$component_markup = '<byda-process-steps';
	foreach ($component_attrs as $name => $value) {
		if ('' === $value && in_array($name, array('debug', 'readonly-address'), true)) {
			$component_markup .= sprintf(' %1$s', esc_attr($name));
			continue;
		}

		$component_markup .= sprintf(' %1$s="%2$s"', esc_attr($name), esc_attr($value));
	}
	$component_markup .= '></byda-process-steps>';

	return $wrapper_markup . $component_markup . '</div>';
}
