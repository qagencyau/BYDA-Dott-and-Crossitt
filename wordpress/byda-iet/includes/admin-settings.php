<?php

defined('ABSPATH') || exit;

function byda_iet_default_settings() {
	return array(
		'byda_use_mock' => 1,
		'external_poller_base_url' => '',
		'external_poller_shared_secret' => '',
		'request_timeout_ms' => 20000,
		'default_buffer_meters' => 10,
		'max_address_candidates' => 5,
		'poll_interval_seconds' => 15,
		'record_retention_days' => 14,
		'gf_form_id' => '',
		'gf_component_field_id' => '',
		'gf_tracking_token_field_id' => '',
		'gf_report_url_field_id' => '',
		'gf_street_number_field_id' => '',
		'gf_street_name_field_id' => '',
		'gf_suburb_field_id' => '',
		'gf_state_field_id' => '',
		'gf_postcode_field_id' => '',
		'gf_reference_field_id' => '',
	);
}

function byda_iet_get_settings() {
	$stored = get_option(BYDA_IET_OPTION, array());
	if (!is_array($stored)) {
		$stored = array();
	}

	return array_merge(byda_iet_default_settings(), $stored);
}

function byda_iet_register_settings() {
	register_setting(
		'byda_iet_settings_group',
		BYDA_IET_OPTION,
		'byda_iet_sanitize_settings'
	);
}

function byda_iet_sanitize_settings($input) {
	$defaults = byda_iet_default_settings();
	$sanitized = array();
	$input = is_array($input) ? $input : array();

	$sanitized['byda_use_mock'] = !empty($input['byda_use_mock']) ? 1 : 0;
	$sanitized['external_poller_base_url'] = esc_url_raw(isset($input['external_poller_base_url']) ? $input['external_poller_base_url'] : '');
	$sanitized['external_poller_shared_secret'] = sanitize_text_field(isset($input['external_poller_shared_secret']) ? $input['external_poller_shared_secret'] : '');
	$sanitized['request_timeout_ms'] = max(1000, absint(isset($input['request_timeout_ms']) ? $input['request_timeout_ms'] : $defaults['request_timeout_ms']));
	$sanitized['default_buffer_meters'] = max(1, absint(isset($input['default_buffer_meters']) ? $input['default_buffer_meters'] : $defaults['default_buffer_meters']));
	$sanitized['max_address_candidates'] = max(1, absint(isset($input['max_address_candidates']) ? $input['max_address_candidates'] : $defaults['max_address_candidates']));
	$sanitized['poll_interval_seconds'] = max(5, absint(isset($input['poll_interval_seconds']) ? $input['poll_interval_seconds'] : $defaults['poll_interval_seconds']));
	$sanitized['record_retention_days'] = max(1, absint(isset($input['record_retention_days']) ? $input['record_retention_days'] : $defaults['record_retention_days']));

	foreach (array(
		'gf_form_id',
		'gf_component_field_id',
		'gf_tracking_token_field_id',
		'gf_report_url_field_id',
		'gf_street_number_field_id',
		'gf_street_name_field_id',
		'gf_suburb_field_id',
		'gf_state_field_id',
		'gf_postcode_field_id',
		'gf_reference_field_id',
	) as $field_key) {
		$sanitized[$field_key] = sanitize_text_field(isset($input[$field_key]) ? $input[$field_key] : '');
	}

	return $sanitized;
}

function byda_iet_render_settings() {
	if (!current_user_can('manage_options')) {
		wp_die('Unauthorized');
	}

	if (!empty($_POST['byda_iet_clear_logs'])) {
		check_admin_referer('byda_iet_clear_logs');
		byda_iet_clear_log_entries();
		add_settings_error('byda_iet_logs', 'byda_iet_logs_cleared', 'BYDA IET logs cleared.', 'updated');
	}

	$settings = byda_iet_get_settings();
	?>
	<div class="wrap">
		<h1>BYDA IET</h1>
		<p>Configure the standalone WordPress package for the BYDA Interactive Enquiry Tool.</p>
		<?php settings_errors('byda_iet_logs'); ?>

		<form method="post" action="options.php">
			<?php settings_fields('byda_iet_settings_group'); ?>

			<h2>Mode</h2>
			<table class="form-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row">Use mock mode</th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[byda_use_mock]" value="1" <?php checked(!empty($settings['byda_use_mock'])); ?>>
								Use mock mode when the poller is unavailable or when testing the UI flow.
							</label>
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Runtime</h2>
			<table class="form-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row"><label for="byda-iet-timeout">Request timeout (ms)</label></th>
						<td><input id="byda-iet-timeout" class="small-text" type="number" min="1000" step="1000" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[request_timeout_ms]" value="<?php echo esc_attr($settings['request_timeout_ms']); ?>"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-buffer">Default parcel buffer (m)</label></th>
						<td><input id="byda-iet-buffer" class="small-text" type="number" min="1" step="1" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[default_buffer_meters]" value="<?php echo esc_attr($settings['default_buffer_meters']); ?>"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-candidates">Max address candidates</label></th>
						<td><input id="byda-iet-candidates" class="small-text" type="number" min="1" step="1" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[max_address_candidates]" value="<?php echo esc_attr($settings['max_address_candidates']); ?>"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-poll-interval">Poll interval (seconds)</label></th>
						<td>
							<input id="byda-iet-poll-interval" class="small-text" type="number" min="5" step="1" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[poll_interval_seconds]" value="<?php echo esc_attr($settings['poll_interval_seconds']); ?>">
							<p class="description">Used for frontend status polling and mock-mode refresh timing. Live BYDA status refresh runs through the external poller service.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-retention">Record retention (days)</label></th>
						<td><input id="byda-iet-retention" class="small-text" type="number" min="1" step="1" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[record_retention_days]" value="<?php echo esc_attr($settings['record_retention_days']); ?>"></td>
					</tr>
				</tbody>
			</table>

			<h2>External Poller</h2>
			<p>Required for live BYDA enquiries. The external service owns all BYDA API credentials, creates live enquiries, handles BYDA lookups, polls BYDA, and calls back into WordPress when status changes or the combined report is ready.</p>
			<table class="form-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row"><label for="byda-iet-poller-url">Poller base URL</label></th>
						<td>
							<input id="byda-iet-poller-url" class="regular-text" type="url" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[external_poller_base_url]" value="<?php echo esc_attr($settings['external_poller_base_url']); ?>" placeholder="https://poller.example.com">
							<p class="description">The plugin will call <code>/options</code>, <code>/organisations/search</code>, and <code>/enquiries</code> on this service and expects callbacks on <code><?php echo esc_html(rest_url('byda-iet/v1/poller-callback')); ?></code>. Leave mock mode on if this is not available yet.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-poller-secret">Shared secret</label></th>
						<td>
							<input id="byda-iet-poller-secret" class="regular-text" type="password" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[external_poller_shared_secret]" value="<?php echo esc_attr($settings['external_poller_shared_secret']); ?>" autocomplete="off">
							<p class="description">Used in the <code>X-BYDA-IET-Secret</code> header for WordPress-to-poller requests and poller callback authentication.</p>
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Gravity Forms</h2>
			<p>The shortcode can render inside a Gravity Forms HTML field without overwriting the saved field content. The plugin settings below are the fallback GF mappings when a shortcode does not provide explicit selectors.</p>
			<table class="form-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row"><label for="byda-iet-gf-form-id">Target form ID</label></th>
						<td><input id="byda-iet-gf-form-id" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_form_id]" value="<?php echo esc_attr($settings['gf_form_id']); ?>" placeholder="163"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-component-id">HTML field ID(s)</label></th>
						<td>
							<input id="byda-iet-gf-component-id" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_component_field_id]" value="<?php echo esc_attr($settings['gf_component_field_id']); ?>" placeholder="125,126">
							<p class="description">Comma-separated HTML field IDs. If blank, HTML fields containing <code>{{byda_iet}}</code> or <code>[byda_iet]</code> will render automatically.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-tracking-token">Hidden tracking token field ID</label></th>
						<td>
							<input id="byda-iet-gf-tracking-token" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_tracking_token_field_id]" value="<?php echo esc_attr($settings['gf_tracking_token_field_id']); ?>" placeholder="441">
							<p class="description">Required for server-side report linkage. The plugin will mirror the BYDA tracking token into this existing Gravity Forms field and will not create the field for you.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-report-url-field">Report URL field ID</label></th>
						<td>
							<input id="byda-iet-gf-report-url-field" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_report_url_field_id]" value="<?php echo esc_attr($settings['gf_report_url_field_id']); ?>" placeholder="442">
							<p class="description">A normal text or hidden field that should receive the stable WordPress report URL. The PDF remains in the poller/Spaces flow and is not uploaded to the Media Library.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-street-number">Street number field/sub-input ID</label></th>
						<td><input id="byda-iet-gf-street-number" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_street_number_field_id]" value="<?php echo esc_attr($settings['gf_street_number_field_id']); ?>" placeholder="435.1"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-street-name">Street name field/sub-input ID</label></th>
						<td><input id="byda-iet-gf-street-name" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_street_name_field_id]" value="<?php echo esc_attr($settings['gf_street_name_field_id']); ?>" placeholder="435.2"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-suburb">Suburb field/sub-input ID</label></th>
						<td><input id="byda-iet-gf-suburb" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_suburb_field_id]" value="<?php echo esc_attr($settings['gf_suburb_field_id']); ?>" placeholder="435.3"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-state">State field/sub-input ID</label></th>
						<td><input id="byda-iet-gf-state" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_state_field_id]" value="<?php echo esc_attr($settings['gf_state_field_id']); ?>" placeholder="435.4"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-postcode">Postcode field/sub-input ID</label></th>
						<td><input id="byda-iet-gf-postcode" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_postcode_field_id]" value="<?php echo esc_attr($settings['gf_postcode_field_id']); ?>" placeholder="435.5"></td>
					</tr>
					<tr>
						<th scope="row"><label for="byda-iet-gf-reference">Reference field/sub-input ID</label></th>
						<td>
							<input id="byda-iet-gf-reference" class="regular-text" type="text" name="<?php echo esc_attr(BYDA_IET_OPTION); ?>[gf_reference_field_id]" value="<?php echo esc_attr($settings['gf_reference_field_id']); ?>" placeholder="440">
							<p class="description">Optional source field. If this field contains a tracking reference, the component will jump straight to Stage 3 and load the status card.</p>
						</td>
					</tr>
				</tbody>
			</table>

			<?php submit_button(); ?>
		</form>

		<?php byda_iet_render_log_section(); ?>
	</div>
	<?php
}

function byda_iet_render_log_section() {
	$logs = byda_iet_get_log_entries(200);
	?>
	<hr>
	<h2>BYDA Logs</h2>
	<p>Recent logs written by the BYDA IET WordPress plugin. These are separate from the external poller process logs.</p>

	<style>
		.byda-iet-log-actions{display:flex;gap:8px;align-items:center;margin:12px 0 16px}
		.byda-iet-log-table{display:block;max-height:560px;overflow:auto;border:1px solid #c3c4c7;background:#fff}
		.byda-iet-log-table table{margin:0;border:0}
		.byda-iet-log-table th{position:sticky;top:0;background:#f6f7f7;z-index:1}
		.byda-iet-log-level{font-weight:700;text-transform:uppercase}
		.byda-iet-log-level.DEBUG{color:#2271b1}
		.byda-iet-log-level.WARNING{color:#996800}
		.byda-iet-log-level.ERROR{color:#b32d2e}
		.byda-iet-log-context{max-width:900px;white-space:pre-wrap;word-break:break-word;background:#f6f7f7;padding:10px;border-radius:4px}
	</style>

	<div class="byda-iet-log-actions">
		<a class="button" href="<?php echo esc_url(admin_url('options-general.php?page=byda-iet')); ?>">Refresh logs</a>
		<form method="post" action="<?php echo esc_url(admin_url('options-general.php?page=byda-iet')); ?>" onsubmit="return window.confirm('Clear BYDA IET logs?');">
			<?php wp_nonce_field('byda_iet_clear_logs'); ?>
			<input type="hidden" name="byda_iet_clear_logs" value="1">
			<?php submit_button('Clear BYDA logs', 'delete small', 'submit', false); ?>
		</form>
		<span class="description">Showing newest <?php echo esc_html((string) count($logs)); ?> of <?php echo esc_html((string) byda_iet_get_log_limit()); ?> stored plugin log entries.</span>
	</div>

	<?php if (empty($logs)) : ?>
		<p>No BYDA IET logs have been captured yet.</p>
	<?php else : ?>
		<div class="byda-iet-log-table">
			<table class="widefat striped">
				<thead>
					<tr>
						<th scope="col">Time</th>
						<th scope="col">Level</th>
						<th scope="col">Message</th>
						<th scope="col">Context</th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ($logs as $entry) : ?>
						<tr>
							<td><code><?php echo esc_html($entry['time']); ?></code></td>
							<td><span class="byda-iet-log-level <?php echo esc_attr($entry['level']); ?>"><?php echo esc_html($entry['level']); ?></span></td>
							<td><?php echo esc_html($entry['message']); ?></td>
							<td>
								<?php if ('' !== $entry['context']) : ?>
									<details>
										<summary>View context</summary>
										<pre class="byda-iet-log-context"><?php echo esc_html($entry['context']); ?></pre>
									</details>
								<?php else : ?>
									<span class="description">No context</span>
								<?php endif; ?>
							</td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	<?php endif; ?>
	<?php
}
