// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {Children, PureComponent} from 'react';
import PropTypes from 'prop-types';
import {Alert, Clipboard, Linking, Text} from 'react-native';
import urlParse from 'url-parse';
import {intlShape} from 'react-intl';

import CustomPropTypes from 'app/constants/custom_prop_types';
import {DeepLinkTypes} from 'app/constants';
import {getCurrentServerUrl} from 'app/init/credentials';
import mattermostManaged from 'app/mattermost_managed';
import BottomSheet from 'app/utils/bottom_sheet';
import {alertErrorWithFallback} from 'app/utils/general';
import {t} from 'app/utils/i18n';
import {preventDoubleTap} from 'app/utils/tap';
import {matchDeepLink, normalizeProtocol} from 'app/utils/url';

import Config from 'assets/config';

export default class MarkdownLink extends PureComponent {
    static propTypes = {
        actions: PropTypes.shape({
            handleSelectChannelByName: PropTypes.func.isRequired,
        }).isRequired,
        children: CustomPropTypes.Children.isRequired,
        href: PropTypes.string.isRequired,
        onPermalinkPress: PropTypes.func,
        serverURL: PropTypes.string,
        siteURL: PropTypes.string.isRequired,
    };

    static defaultProps = {
        onPermalinkPress: () => true,
        serverURL: '',
        siteURL: '',
    };

    static contextTypes = {
        intl: intlShape.isRequired,
    };

    handlePress = preventDoubleTap(async () => {
        const {href, onPermalinkPress, serverURL, siteURL} = this.props;
        const url = normalizeProtocol(href);

        if (!url) {
            return;
        }

        let serverUrl = serverURL;
        if (!serverUrl) {
            serverUrl = await getCurrentServerUrl();
        }

        const match = matchDeepLink(url, serverURL, siteURL);

        if (match) {
            if (match.type === DeepLinkTypes.CHANNEL) {
                const error = await this.props.actions.handleSelectChannelByName(match.channelName, match.teamName);

                if (error) {
                    const linkFailedMessage = {
                        id: t('mobile.server_link.private_channel.error'),
                        defaultMessage: 'You are not a member of this private channel.',
                    };

                    alertErrorWithFallback(this.context.intl, {}, linkFailedMessage);
                }
            } else if (match.type === DeepLinkTypes.PERMALINK) {
                onPermalinkPress(match.postId, match.teamName);
            }
        } else {
            Linking.canOpenURL(url).then((supported) => {
                if (supported) {
                    Linking.openURL(url);
                } else {
                    const {formatMessage} = this.context.intl;
                    Alert.alert(
                        formatMessage({
                            id: 'mobile.server_link.error.title',
                            defaultMessage: 'Link Error',
                        }),
                        formatMessage({
                            id: 'mobile.server_link.error.text',
                            defaultMessage: 'The link could not be found on this server.',
                        }),
                    );
                }
            });
        }
    });

    parseLinkLiteral = (literal) => {
        let nextLiteral = literal;

        const WWW_REGEX = /\b^(?:www.)/i;
        if (nextLiteral.match(WWW_REGEX)) {
            nextLiteral = literal.replace(WWW_REGEX, 'www.');
        }

        const parsed = urlParse(nextLiteral, {});

        return parsed.href;
    };

    parseChildren = () => {
        return Children.map(this.props.children, (child) => {
            if (!child.props.literal || typeof child.props.literal !== 'string' || (child.props.context && child.props.context.length && !child.props.context.includes('link'))) {
                return child;
            }

            const {props, ...otherChildProps} = child;
            const {literal, ...otherProps} = props;

            const nextProps = {
                literal: this.parseLinkLiteral(literal),
                ...otherProps,
            };

            return {
                props: nextProps,
                ...otherChildProps,
            };
        });
    };

    handleLongPress = async () => {
        const {formatMessage} = this.context.intl;

        const config = mattermostManaged.getCachedConfig();

        if (config?.copyAndPasteProtection !== 'true') {
            const cancelText = formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'});
            const actionText = formatMessage({id: 'mobile.markdown.link.copy_url', defaultMessage: 'Copy URL'});
            BottomSheet.showBottomSheetWithOptions({
                options: [actionText, cancelText],
                cancelButtonIndex: 1,
            }, (value) => {
                if (value !== 1) {
                    this.handleLinkCopy();
                }
            });
        }
    };

    handleLinkCopy = () => {
        Clipboard.setString(this.props.href);
    };

    render() {
        const children = Config.ExperimentalNormalizeMarkdownLinks ? this.parseChildren() : this.props.children;

        return (
            <Text
                onPress={this.handlePress}
                onLongPress={this.handleLongPress}
            >
                {children}
            </Text>
        );
    }
}
